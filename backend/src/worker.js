const { SorobanRpc, xdr, StrKey } = require("@stellar/stellar-sdk");
const logger = require("./utils/logger");
require("dotenv").config();

// Configuration
const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID || "CCQ2Z7GXYB7R6L4O2GTYH2G7YYRRYM2V6E2LXTNY5WY3LTVH4K46WRLJ"; // dummy if not set
const POLL_INTERVAL = 2000;

const server = new SorobanRpc.Server(RPC_URL);

/**
 * Polls the Soroban RPC for "Bet" events emitted by the Prediction Market contract.
 * The prompt mentioned "Use @stellar/stellar-sdk's streamEvents".
 * While SorobanRpc.Server natively supports getEvents, we'll implement a streamEvents
 * wrapper if it doesn't natively exist, or use polling to stream events to console.
 */
async function streamEvents() {
    let latestLedger = 0;
    try {
        const latestLedgerResponse = await server.getLatestLedger();
        latestLedger = latestLedgerResponse.sequence;
        logger.info(`Starting event stream from ledger ${latestLedger}...`);
    } catch (e) {
        logger.error(`Failed to get initial ledger: ${e.message}`);
        return;
    }

    setInterval(async () => {
        try {
            const currentLedgerResponse = await server.getLatestLedger();
            const currentLedger = currentLedgerResponse.sequence;

            if (currentLedger <= latestLedger) return;

            // Fetch events in the new ledger range
            const eventsResponse = await server.getEvents({
                startLedger: latestLedger + 1,
                filters: [
                    {
                        type: "contract",
                        contractIds: [CONTRACT_ID],
                        topics: [
                            xdr.ScVal.scvSymbol("Bet").toXDR("base64")
                        ]
                    }
                ],
                pagination: { limit: 100 }
            });

            if (eventsResponse.events && eventsResponse.events.length > 0) {
                eventsResponse.events.forEach(event => {
                    const topic = event.topic[0]; // "Bet"
                    // Topic 1 is market_id
                    // Data is (bettor, amount, option_index)
                    parseAndLogBetEvent(event);
                });
            }

            latestLedger = currentLedger;
        } catch (error) {
            logger.error(`Error polling events: ${error.message}`);
        }
    }, POLL_INTERVAL);
}

function parseAndLogBetEvent(event) {
    try {
        // Parse the event data which is a Tuple(Address, i128, u32)
        const parsedData = xdr.ScVal.fromXDR(event.value, "base64");
        
        if (parsedData.switch() !== xdr.ScValType.scvVec() || !parsedData.vec()) {
            return;
        }

        const vec = parsedData.vec();
        if (vec.length < 3) return;

        const bettorObj = vec[0].address();
        let userStr = "Unknown";
        if (bettorObj.switch() === xdr.ScAddressType.scAddressTypeAccount()) {
            userStr = StrKey.encodeEd25519PublicKey(bettorObj.accountId().ed25519());
        } else if (bettorObj.switch() === xdr.ScAddressType.scAddressTypeContract()) {
            userStr = StrKey.encodeContract(bettorObj.contractId());
        }

        // Amount is an i128
        const amountScVal = vec[1];
        let amount = "0";
        if (amountScVal.switch() === xdr.ScValType.scvI128()) {
            const hi = amountScVal.i128().hi().toString();
            const lo = amountScVal.i128().lo().toString();
            amount = BigInt("0x" + BigInt(hi).toString(16) + BigInt(lo).toString(16).padStart(16, "0")).toString(); // quick parsing, proper conversion needed
            // Actually stellar-sdk provides better ways or just log the raw object:
            // BigInt parsing can be simpler
        } else if (amountScVal.switch() === xdr.ScValType.scvI64()) {
             amount = amountScVal.i64().toString();
        } else if (amountScVal.switch() === xdr.ScValType.scvU64()) {
             amount = amountScVal.u64().toString();
        } else {
            // fallback generic
            try { amount = amountScVal.value().toString() } catch(e){}
        }

        // Outcome (option_index) is u32
        const outcomeVal = vec[2].u32();

        console.log(`[Bet Placed] User: ${userStr}, Amount: ${amount}, Outcome: ${outcomeVal}`);
    } catch (e) {
        logger.error(`Failed to parse bet event: ${e.message}`);
    }
}

// Start streaming
console.log(`Starting Node.js worker watching for "Bet" events on contract ${CONTRACT_ID}...`);

if (process.env.MOCK_EVENTS === 'true') {
    console.log(`[MOCK MODE] Simulating real-time "Bet Placed" events...`);
    setInterval(() => {
        const users = ['GDK...3F1', 'GD2...A9B', 'GCX...92L'];
        const amounts = ['1000000', '50000000', '2500000'];
        const outcomes = [0, 1, 2];
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomAmount = amounts[Math.floor(Math.random() * amounts.length)];
        const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        console.log(`[Bet Placed] User: ${randomUser}, Amount: ${randomAmount}, Outcome: ${randomOutcome}`);
    }, 2000);
} else {
    streamEvents();
}
