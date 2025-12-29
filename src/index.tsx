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
  ASK_AMOUNT: 'ask_amount', // NEW: Ask for amount
  EXPLAIN_PROCESS: 'explain_process',
  OWNERSHIP_VALIDATION: 'ownership_validation',
  WAIT_OWNERSHIP_TX: 'wait_ownership_tx',
  OWNERSHIP_CONFIRMED: 'ownership_confirmed',
  WAIT_FULL_PAYMENT: 'wait_full_payment',
  PAYMENT_RECEIVED: 'payment_received',
  CONFIRM_CONVERSION: 'confirm_conversion',
  COMPLETED: 'completed',
  CLOSED: 'closed'
}

// Fixed transaction parameters - CANNOT be modified by user
const FIXED_PARAMS = {
  FEE_PERCENT: 0.5,
  CANCEL_FEE_PERCENT: 0.5,
  VALIDATION_AMOUNT: 2.64,
  VALIDATION_CRYPTO: 'USDC',
  WALLET_ADDRESS: '0x7F5EB5bB5cF88cfcEe9613368636f458800e62CB',
  VALIDATION_NETWORK: 'Ethereum',
  RATE_VALIDITY_MINUTES: 2
}

// FAQ responses - Agent can answer these but NEVER modify terms
const FAQ_RESPONSES: { [key: string]: string } = {
  'fee': `Our service fee is **${FIXED_PARAMS.FEE_PERCENT}%** of the transaction amount. This is fixed and cannot be modified.`,
  'rate': 'The exchange rate is calculated at the moment of confirmation and is valid for **2 minutes**. Rates are provided by real-time market data and cannot be negotiated.',
  'time': 'The entire process takes approximately **2 minutes**. Once confirmed, EUR are credited to your IBAN within minutes.',
  'cancel': `You can cancel anytime before final confirmation. A **${FIXED_PARAMS.CANCEL_FEE_PERCENT}% fee** applies for cancellations after funds are received.`,
  'security': 'All transactions are secured with end-to-end encryption, KYC compliance, and multi-signature wallet protection.',
  'iban': 'The destination IBAN is the one registered on your Monetum account and cannot be changed during the transaction.',
  'minimum': 'There is no strict minimum, but we recommend at least 100 USDC equivalent for optimal rates.',
  'maximum': 'Maximum amounts depend on your account status and verification level. Standard accounts: €50,000/day.',
  'wallet': `All funds must be sent to our secure wallet: \`${FIXED_PARAMS.WALLET_ADDRESS}\``,
  'network': 'We support Ethereum, Polygon, Arbitrum, Optimism, Base, and Bitcoin networks.',
  'help': 'I can help you with:\n• Transaction process\n• Fees and rates\n• Security questions\n• Timing and limits\n\nJust ask any question!'
}

// Detect if message is a question
function isQuestion(message: string): boolean {
  const questionPatterns = [
    /\?$/,
    /^(what|how|why|when|where|who|which|can|could|would|is|are|do|does|will|should)/i,
    /^(tell me|explain|help|info|information)/i,
    /^(fee|rate|time|cancel|security|minimum|maximum|limit)/i
  ]
  return questionPatterns.some(pattern => pattern.test(message.trim()))
}

// Detect if user is trying to modify terms (NOT ALLOWED)
function isModificationAttempt(message: string): boolean {
  const modificationPatterns = [
    /change.*fee/i,
    /modify.*rate/i,
    /lower.*fee/i,
    /better.*rate/i,
    /discount/i,
    /reduce.*fee/i,
    /different.*iban/i,
    /change.*iban/i,
    /change.*wallet/i,
    /increase.*limit/i,
    /waive.*fee/i,
    /no fee/i,
    /free/i,
    /special.*rate/i,
    /negotiate/i
  ]
  return modificationPatterns.some(pattern => pattern.test(message.trim()))
}

// Get FAQ response
function getFAQResponse(message: string): string | null {
  const lowerMessage = message.toLowerCase()
  
  for (const [keyword, response] of Object.entries(FAQ_RESPONSES)) {
    if (lowerMessage.includes(keyword)) {
      return response
    }
  }
  
  // Generic helpful response
  if (isQuestion(message)) {
    return "I'd be happy to help! Could you be more specific? I can answer questions about:\n• Fees (0.5%)\n• Exchange rates\n• Transaction timing\n• Security measures\n• Limits and requirements"
  }
  
  return null
}

// API endpoint for chat
app.post('/api/chat', async (c) => {
  const body = await c.req.json()
  const { message, state, userData, isQuestion: clientIsQuestion } = body

  // If user is asking a question during the process
  if (clientIsQuestion || (message && isQuestion(message) && state !== OTC_STEPS.WELCOME)) {
    // Check for modification attempts first
    if (isModificationAttempt(message)) {
      return c.json({
        messages: [
          "I understand you'd like different terms, but I'm not able to modify the transaction parameters.",
          `Our fees (${FIXED_PARAMS.FEE_PERCENT}%), rates, and wallet addresses are fixed for security and compliance reasons.`,
          "Is there anything else I can help you with, or shall we continue with the transaction?"
        ],
        nextState: state,
        continueProcess: true
      })
    }
    
    // Try to answer the question
    const faqResponse = getFAQResponse(message)
    if (faqResponse) {
      return c.json({
        messages: [
          faqResponse,
          "Anything else I can help with? Or click **Continue** to proceed with your transaction."
        ],
        nextState: state,
        continueProcess: true,
        showContinueButton: true
      })
    }
  }

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
      return {
        messages: [
          `**${userData.network}** selected ✓`,
          `How much **${userData.crypto}** would you like to sell?`
        ],
        nextState: OTC_STEPS.ASK_AMOUNT,
        inputType: 'number',
        inputLabel: `Amount in ${userData.crypto}`,
        inputPlaceholder: `Enter amount in ${userData.crypto}...`,
        inputField: 'intendedAmount',
        inputStep: '0.01',
        inputMin: '0'
      }

    case OTC_STEPS.ASK_AMOUNT:
      const amount = parseFloat(userData.intendedAmount)
      if (isNaN(amount) || amount <= 0) {
        return {
          messages: [
            "Please enter a valid amount greater than 0."
          ],
          nextState: OTC_STEPS.ASK_AMOUNT,
          inputType: 'number',
          inputLabel: `Amount in ${userData.crypto}`,
          inputPlaceholder: `Enter amount in ${userData.crypto}...`,
          inputField: 'intendedAmount',
          inputStep: '0.01',
          inputMin: '0'
        }
      }
      return {
        messages: [
          `**${userData.intendedAmount} ${userData.crypto}** ✓`,
          `Here's how we'll proceed. It takes around **2 minutes** and you can cancel anytime.\n\n📋 **The 4 steps:**\n\n**1.** Wallet verification → send a small amount to confirm ownership (~${FIXED_PARAMS.VALIDATION_AMOUNT} ${FIXED_PARAMS.VALIDATION_CRYPTO})\n**2.** Full payment → once confirmed, send the remaining amount\n**3.** Rate & confirmation → we calculate the conversion rate. Valid for ${FIXED_PARAMS.RATE_VALIDITY_MINUTES} min. You can accept or cancel (${FIXED_PARAMS.CANCEL_FEE_PERCENT}% fee)\n**4.** Done → EUR sent to your Monetum IBAN 👌`,
          "Ready to proceed? Just say **OK**"
        ],
        nextState: OTC_STEPS.EXPLAIN_PROCESS,
        inputType: 'text',
        inputLabel: 'Your response',
        inputPlaceholder: 'Type OK to continue...',
        inputField: 'confirmProcess'
      }

    case OTC_STEPS.EXPLAIN_PROCESS:
      return {
        messages: [
          "Perfect! Let's start 🚀",
          "🔐 **Step 1: Wallet Verification**",
          `Please send exactly **${FIXED_PARAMS.VALIDATION_AMOUNT} ${FIXED_PARAMS.VALIDATION_CRYPTO}** to:\n\n\`${FIXED_PARAMS.WALLET_ADDRESS}\`\n\n**Network:** ${FIXED_PARAMS.VALIDATION_NETWORK}\n\nThis amount will be credited back to you.`,
          "Enter the **TX hash** below or click validate."
        ],
        nextState: OTC_STEPS.WAIT_OWNERSHIP_TX,
        inputType: 'text',
        inputLabel: 'Transaction ID (optional)',
        inputPlaceholder: 'Enter TX hash or click validate...',
        inputField: 'ownershipTxId',
        showValidateButton: true,
        validationAmount: FIXED_PARAMS.VALIDATION_AMOUNT,
        validationCrypto: FIXED_PARAMS.VALIDATION_CRYPTO
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
      const remainingAmount = Math.max(0, parseFloat(userData.intendedAmount || '0') - FIXED_PARAMS.VALIDATION_AMOUNT)
      return {
        messages: [
          "✅ **Wallet verified!**",
          "🔐 **Step 2: Full Payment**",
          `Send **${remainingAmount.toFixed(2)} ${userData.crypto}** to:\n\n\`${FIXED_PARAMS.WALLET_ADDRESS}\`\n\n**Network:** ${userData.network}`,
          "Enter the **TX hash** once sent."
        ],
        nextState: OTC_STEPS.WAIT_FULL_PAYMENT,
        inputType: 'text',
        inputLabel: 'Transaction ID',
        inputPlaceholder: 'Enter TX hash...',
        inputField: 'paymentTxId',
        showValidateButton: true,
        remainingAmount: remainingAmount.toFixed(2)
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
      // Simulate received amount - can be less, equal, or more than intended
      const intendedTotal = parseFloat(userData.intendedAmount || '0')
      
      // For simulation: randomly vary by -10% to +20%
      const variance = (Math.random() * 0.3) - 0.1 // -10% to +20%
      let receivedAmount = intendedTotal * (1 + variance)
      receivedAmount = Math.max(receivedAmount, 100) // Minimum 100 for demo
      
      // Check if received > intended (excess handling)
      let excessNote = ''
      if (receivedAmount > intendedTotal * 1.05) {
        // For test: we accept anyway but note the excess
        const excess = receivedAmount - intendedTotal
        excessNote = `\n\n⚠️ **Note:** Received ${excess.toFixed(2)} ${userData.crypto} more than expected. Proceeding with full amount for this test.`
      }
      
      // Get rate based on crypto type (simulated rates)
      const rates: { [key: string]: number } = {
        'USDC': 0.92,
        'USDT': 0.92,
        'DAI': 0.92,
        'ETH': 3450.00,
        'BTC': 42500.00
      }
      const rate = rates[userData.crypto] || 0.92
      
      const grossAmount = receivedAmount * rate
      const fees = grossAmount * (FIXED_PARAMS.FEE_PERCENT / 100)
      const netAmount = grossAmount - fees
      
      return {
        messages: [
          "✅ **Funds received!**" + excessNote,
          `📊 **Summary:**\n\n| Description | Amount |\n|-------------|--------|\n| ${userData.crypto} Received | ${receivedAmount.toFixed(2)} ${userData.crypto} |\n| Rate | 1 ${userData.crypto} = €${rate.toFixed(4)} |\n| Gross | €${grossAmount.toFixed(2)} |\n| Fee (${FIXED_PARAMS.FEE_PERCENT}%) | -€${fees.toFixed(2)} |\n| **Net** | **€${netAmount.toFixed(2)}** |`,
          `⏱ **You have ${FIXED_PARAMS.RATE_VALIDITY_MINUTES} minutes** to confirm this rate.\n\nClick **Confirm** to proceed or **Cancel** for a refund (${FIXED_PARAMS.CANCEL_FEE_PERCENT}% fee).`
        ],
        nextState: OTC_STEPS.CONFIRM_CONVERSION,
        showConfirmButtons: true,
        transactionData: {
          intendedAmount: intendedTotal.toFixed(2),
          receivedAmount: receivedAmount.toFixed(2),
          crypto: userData.crypto,
          rate,
          feePercent: FIXED_PARAMS.FEE_PERCENT,
          fees: fees.toFixed(2),
          grossAmount: grossAmount.toFixed(2),
          netAmount: netAmount.toFixed(2)
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
        const cancelFee = parseFloat(userData.transactionData?.grossAmount || '0') * (FIXED_PARAMS.CANCEL_FEE_PERCENT / 100)
        return {
          messages: [
            "❌ **Transaction Cancelled**",
            `Your funds will be returned minus ${FIXED_PARAMS.CANCEL_FEE_PERCENT}% fee (€${cancelFee.toFixed(2)}) within 24-48h.`,
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
          `**€${userData.transactionData?.netAmount || '0.00'}** will be credited to your Monetum IBAN within minutes.`,
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
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
                            greenDark: '#2d8a72',
                            dark: '#2A2B41',
                            light: '#f8fafc',
                            chatBg: '#f5f7f9',
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
        * {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
            font-family: 'Inter', sans-serif;
            background: #ffffff;
        }
        .app-container {
            height: 100dvh;
            display: flex;
            flex-direction: column;
            max-width: 100%;
            margin: 0 auto;
        }
        @media (min-width: 640px) {
            .app-container {
                max-width: 480px;
                height: 100dvh;
                padding: 16px;
            }
            .widget-container {
                border-radius: 16px;
                border: 2px solid #3DA085;
                box-shadow: 0 4px 24px rgba(61, 160, 133, 0.15);
                overflow: hidden;
            }
        }
        .widget-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #ffffff;
            min-height: 0;
        }
        .widget-header {
            background: #3DA085;
            padding: 16px;
            flex-shrink: 0;
        }
        .secure-badge {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            background: #f5f7f9;
            padding: 16px;
            min-height: 0;
            -webkit-overflow-scrolling: touch;
        }
        .input-area {
            background: #ffffff;
            padding: 16px;
            flex-shrink: 0;
            border-top: 1px solid #e5e7eb;
        }
        .widget-footer {
            background: #ffffff;
            padding: 8px 16px;
            flex-shrink: 0;
            border-top: 1px solid #f0f0f0;
        }
        .chat-message {
            animation: fadeIn 0.3s ease-out;
            margin-bottom: 12px;
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
        input[type="number"].input-secure {
            -moz-appearance: textfield;
        }
        input[type="number"].input-secure::-webkit-outer-spin-button,
        input[type="number"].input-secure::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        .btn-primary {
            background: #3DA085;
            transition: all 0.2s ease;
        }
        .btn-primary:hover, .btn-primary:active {
            background: #2d8a72;
        }
        .btn-success {
            background: #3DA085;
        }
        .btn-success:hover, .btn-success:active {
            background: #2d8a72;
        }
        .btn-danger {
            background: #ef4444;
        }
        .btn-danger:hover, .btn-danger:active {
            background: #dc2626;
        }
        .btn-question {
            background: transparent;
            border: 1px solid #e2e8f0;
            color: #64748b;
        }
        .btn-question:hover {
            border-color: #3DA085;
            color: #3DA085;
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
            margin: 8px 0;
            font-size: 12px;
        }
        .markdown-table th, .markdown-table td {
            padding: 6px 10px;
            border: 1px solid #e2e8f0;
            text-align: left;
        }
        .markdown-table th {
            background: rgba(61, 160, 133, 0.1);
            color: #2A2B41;
        }
        code {
            background: rgba(61, 160, 133, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            word-break: break-all;
            color: #2A2B41;
            font-size: 11px;
        }
        .agent-bubble {
            background: #ffffff;
            color: #2A2B41;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .user-bubble {
            background: #3DA085;
            color: white;
        }
        .agent-avatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
        }
        .trust-indicators {
            display: flex;
            justify-content: center;
            gap: 16px;
            padding: 8px 0;
            flex-wrap: wrap;
        }
        @media (max-width: 639px) {
            .trust-indicators {
                display: none;
            }
            .widget-footer {
                padding-bottom: calc(8px + env(safe-area-inset-bottom));
            }
            .input-area {
                padding-bottom: calc(16px + env(safe-area-inset-bottom));
            }
        }
        .question-input-container {
            display: none;
            margin-top: 8px;
        }
        .question-input-container.active {
            display: flex;
        }
    </style>
</head>
<body>
    <div class="app-container">
        <div class="widget-container">
            <!-- Header - Green background -->
            <div class="widget-header">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <!-- Monetum Logo SVG - White -->
                        <div class="w-10 h-10">
                            <svg viewBox="0 0 100 100" class="w-full h-full">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="white" stroke-width="5"/>
                                <path d="M30 65 L30 35 L50 50 L70 35 L70 65" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M25 50 L50 35 L75 50" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div>
                            <h1 class="text-lg font-semibold text-white">Initiate OTC Deal</h1>
                            <p class="text-xs text-white/70">Monetum Secure Trading</p>
                        </div>
                    </div>
                    <!-- Security Badge -->
                    <div class="secure-badge px-2 py-1 rounded-full flex items-center gap-1">
                        <i class="fas fa-shield-halved text-white text-xs"></i>
                        <span class="text-xs text-white font-medium">Secured</span>
                    </div>
                </div>
            </div>

            <!-- Chat Container - Light gray background -->
            <div id="chatContainer" class="chat-container">
                <!-- Welcome message - will be removed when chat starts -->
                <div id="welcomeMessage" class="flex flex-col items-center justify-center h-full text-center px-6">
                    <div class="w-16 h-16 mb-4 opacity-80">
                        <svg viewBox="0 0 100 100" class="w-full h-full">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="#3DA085" stroke-width="4"/>
                            <path d="M30 65 L30 35 L50 50 L70 35 L70 65" fill="none" stroke="#3DA085" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M25 50 L50 35 L75 50" fill="none" stroke="#3DA085" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <h2 class="text-lg font-semibold text-monetum-dark mb-2">Welcome to Monetum OTC</h2>
                    <p class="text-sm text-monetum-muted leading-relaxed max-w-xs">
                        Execute OTC deals securely via chat. Fast, compliant, and fully encrypted.
                    </p>
                    <p class="text-sm text-monetum-muted mt-3">
                        Start the conversation whenever you're ready 👇
                    </p>
                </div>
            </div>

            <!-- Input Area - White background -->
            <div id="inputArea" class="input-area">
                <div id="startButton" class="text-center">
                    <button onclick="startChat()" class="btn-primary px-8 py-3 rounded-xl text-white font-medium pulse-glow">
                        <i class="fas fa-comments mr-2"></i>
                        Start OTC Deal
                    </button>
                </div>
            </div>

            <!-- Footer -->
            <div class="widget-footer flex items-center justify-between text-xs text-monetum-muted">
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

        <!-- Trust Indicators - Only on desktop -->
        <div class="trust-indicators text-monetum-muted text-xs mt-3">
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
        let questionMode = false;
        
        // Agent avatar URL
        const AGENT_AVATAR = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face';

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
            messageDiv.className = 'chat-message flex ' + (isAgent ? 'justify-start items-end gap-2' : 'justify-end');
            
            if (isAgent) {
                const avatar = document.createElement('img');
                avatar.src = AGENT_AVATAR;
                avatar.alt = 'Alex';
                avatar.className = 'agent-avatar';
                messageDiv.appendChild(avatar);
            }
            
            const bubble = document.createElement('div');
            bubble.className = 'max-w-[80%] px-3 py-2 rounded-2xl text-sm ' + (isAgent ? 'agent-bubble rounded-bl-sm' : 'user-bubble rounded-tr-sm');
            
            const text = document.createElement('div');
            text.className = 'leading-relaxed';
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
            typingDiv.className = 'chat-message flex justify-start items-end gap-2';
            typingDiv.innerHTML = '<img src="' + AGENT_AVATAR + '" alt="Alex" class="agent-avatar"><div class="agent-bubble px-3 py-2 rounded-2xl rounded-bl-sm"><div class="typing-indicator flex gap-1"><span class="w-2 h-2 bg-monetum-green rounded-full"></span><span class="w-2 h-2 bg-monetum-green rounded-full"></span><span class="w-2 h-2 bg-monetum-green rounded-full"></span></div></div>';
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
            
            if (response.showContinueButton) {
                inputArea.innerHTML = '<div class="text-center"><button onclick="sendMessage(\\'continue\\')" class="btn-primary px-8 py-3 rounded-xl text-white font-medium"><i class="fas fa-arrow-right mr-2"></i>Continue</button></div>';
                return;
            }
            
            if (response.showNewDealButton || response.showCloseButton) {
                let html = '<div class="flex gap-3 justify-center">';
                if (response.showNewDealButton) {
                    html += '<button onclick="sendMessage(\\'new\\')" class="btn-primary px-5 py-2 rounded-xl text-white font-medium text-sm"><i class="fas fa-plus mr-2"></i>New Deal</button>';
                }
                if (response.showCloseButton) {
                    html += '<button onclick="sendMessage(\\'close\\')" class="bg-white border border-gray-300 px-5 py-2 rounded-xl text-monetum-dark font-medium text-sm"><i class="fas fa-times mr-2"></i>Close</button>';
                }
                html += '</div>';
                inputArea.innerHTML = html;
                return;
            }
            
            if (response.showConfirmButtons) {
                inputArea.innerHTML = '<div class="flex gap-3 justify-center"><button onclick="sendMessage(\\'confirm\\')" class="btn-success px-6 py-3 rounded-xl text-white font-medium"><i class="fas fa-check mr-2"></i>Confirm</button><button onclick="sendMessage(\\'cancel\\')" class="btn-danger px-6 py-3 rounded-xl text-white font-medium"><i class="fas fa-times mr-2"></i>Cancel</button></div>';
                return;
            }
            
            if (response.inputType) {
                let inputHtml = '';
                
                if (response.inputType === 'select') {
                    inputHtml = '<select id="userInput" class="input-secure w-full px-4 py-3 rounded-xl focus:outline-none text-sm"><option value="" style="color: #94a3b8;">Select ' + response.inputLabel + '...</option>';
                    response.inputOptions.forEach(function(opt) {
                        inputHtml += '<option value="' + opt + '" style="color: #2A2B41;">' + opt + '</option>';
                    });
                    inputHtml += '</select>';
                } else if (response.inputType === 'number') {
                    inputHtml = '<input type="number" id="userInput" placeholder="' + response.inputPlaceholder + '" step="' + (response.inputStep || '0.01') + '" min="' + (response.inputMin || '0') + '" class="input-secure w-full px-4 py-3 rounded-xl focus:outline-none text-sm" onkeypress="if(event.key === \\'Enter\\') submitInput()">';
                } else {
                    inputHtml = '<input type="' + response.inputType + '" id="userInput" placeholder="' + response.inputPlaceholder + '" class="input-secure w-full px-4 py-3 rounded-xl focus:outline-none text-sm" onkeypress="if(event.key === \\'Enter\\') submitInput()">';
                }
                
                let validateBtn = '';
                if (response.showValidateButton) {
                    validateBtn = '<button onclick="autoValidate()" class="bg-white border border-monetum-green px-3 py-3 rounded-xl text-monetum-green"><i class="fas fa-sync"></i></button>';
                }
                
                // Question button for asking questions during process
                let questionBtn = '<button onclick="toggleQuestionMode()" class="btn-question px-3 py-3 rounded-xl" title="Ask a question"><i class="fas fa-question"></i></button>';
                
                inputArea.innerHTML = '<div class="space-y-2"><div class="flex items-center gap-2 text-xs text-monetum-muted"><i class="fas fa-shield-halved text-monetum-green"></i><span>Secure input · ' + response.inputLabel + '</span></div><div class="flex gap-2">' + inputHtml + '<button onclick="submitInput()" class="btn-primary px-3 py-3 rounded-xl text-white"><i class="fas fa-paper-plane"></i></button>' + validateBtn + questionBtn + '</div><div id="questionInputContainer" class="question-input-container gap-2"><input type="text" id="questionInput" placeholder="Ask a question..." class="input-secure flex-1 px-4 py-2 rounded-xl focus:outline-none text-sm" onkeypress="if(event.key === \\'Enter\\') submitQuestion()"><button onclick="submitQuestion()" class="btn-primary px-3 py-2 rounded-xl text-white text-sm"><i class="fas fa-paper-plane"></i></button></div></div>';
                
                window.currentInputField = response.inputField;
                
                setTimeout(function() {
                    const input = document.getElementById('userInput');
                    if (input) input.focus();
                }, 100);
            }
        }

        function toggleQuestionMode() {
            const container = document.getElementById('questionInputContainer');
            if (container) {
                container.classList.toggle('active');
                if (container.classList.contains('active')) {
                    document.getElementById('questionInput').focus();
                }
            }
        }

        async function submitQuestion() {
            const input = document.getElementById('questionInput');
            if (!input) return;
            
            const question = input.value.trim();
            if (!question) return;
            
            input.value = '';
            document.getElementById('questionInputContainer').classList.remove('active');
            
            addMessage(question, false);
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: question,
                        state: currentState,
                        userData: userData,
                        isQuestion: true
                    })
                });
                
                const data = await response.json();
                
                await displayMessagesSequentially(data.messages || [data.agentMessage]);
                
                // If continueProcess, re-render the current input
                if (data.continueProcess && data.showContinueButton) {
                    renderInput({ showContinueButton: true });
                }
                
            } catch (error) {
                addMessage('Sorry, there was an error. Please try again.');
            }
        }

        async function sendMessage(message) {
            if (!message || message.trim() === '') return;
            
            if (message !== 'continue') {
                addMessage(message, false);
            }
            
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
            
            // Remove welcome message
            const welcomeMsg = document.getElementById('welcomeMessage');
            if (welcomeMsg) welcomeMsg.remove();
            
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
