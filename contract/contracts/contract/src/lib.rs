#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map};

#[contracttype]
#[derive(Clone)]
pub struct Invoice {
    pub creator: Address,
    pub face_value: i128,
    pub discount_rate: u32,
    pub factor: Option<Address>,
    pub funded: bool,
    pub paid: bool,
    pub claimed: bool,
}

#[contracttype]
pub enum DataKey {
    Invoices,
    NextId,
}

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    /// Create an invoice. Permissionless — anyone can list one for factoring.
    /// face_value: amount owed by the debtor
    /// discount_rate: basis points (e.g. 300 = 3%)
    pub fn create_invoice(env: Env, creator: Address, face_value: i128, discount_rate: u32) -> u64 {
        creator.require_auth();
        assert!(face_value > 0, "invalid amount");
        assert!(
            discount_rate > 0 && discount_rate < 10000,
            "invalid discount rate"
        );

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0) + 1;
        let invoice = Invoice {
            creator,
            face_value,
            discount_rate,
            factor: None,
            funded: false,
            paid: false,
            claimed: false,
        };

        let mut invoices: Map<u64, Invoice> = env
            .storage()
            .instance()
            .get(&DataKey::Invoices)
            .unwrap_or(Map::new(&env));
        invoices.set(id, invoice);
        env.storage().instance().set(&DataKey::Invoices, &invoices);
        env.storage().instance().set(&DataKey::NextId, &id);
        id
    }

    /// Fund (buy) an invoice at a discount. Permissionless — anyone can be the factor.
    /// Returns the discounted amount the factor pays.
    pub fn fund_invoice(env: Env, factor: Address, invoice_id: u64) -> i128 {
        factor.require_auth();

        let mut invoices: Map<u64, Invoice> = env
            .storage()
            .instance()
            .get(&DataKey::Invoices)
            .expect("no invoices");
        let mut inv = invoices.get(invoice_id).expect("invoice not found");
        assert!(!inv.funded, "already funded");

        let discounted = inv.face_value * (10000 - inv.discount_rate as i128) / 10000;
        inv.factor = Some(factor);
        inv.funded = true;
        invoices.set(invoice_id, inv);
        env.storage().instance().set(&DataKey::Invoices, &invoices);
        discounted
    }

    /// Mark invoice as paid. Permissionless — anyone can call
    /// (in production, payment would be proven via oracle).
    pub fn mark_paid(env: Env, _caller: Address, invoice_id: u64) {
        _caller.require_auth();

        let mut invoices: Map<u64, Invoice> = env
            .storage()
            .instance()
            .get(&DataKey::Invoices)
            .expect("no invoices");
        let mut inv = invoices.get(invoice_id).expect("invoice not found");
        inv.paid = true;
        invoices.set(invoice_id, inv);
        env.storage().instance().set(&DataKey::Invoices, &invoices);
    }

    /// Factor claims their return after invoice is marked paid.
    /// Returns the discounted amount they originally paid.
    pub fn claim_payment(env: Env, factor: Address, invoice_id: u64) -> i128 {
        factor.require_auth();

        let mut invoices: Map<u64, Invoice> = env
            .storage()
            .instance()
            .get(&DataKey::Invoices)
            .expect("no invoices");
        let mut inv = invoices.get(invoice_id).expect("invoice not found");
        assert!(inv.funded, "not funded");
        assert!(inv.paid, "not paid yet");
        assert!(!inv.claimed, "already claimed");
        assert!(
            inv.factor.as_ref().unwrap() == &factor,
            "only factor can claim"
        );

        let discounted = inv.face_value * (10000 - inv.discount_rate as i128) / 10000;
        inv.claimed = true;
        invoices.set(invoice_id, inv);
        env.storage().instance().set(&DataKey::Invoices, &invoices);
        discounted
    }

    /// Read invoice details. Permissionless — anyone can query.
    pub fn get_invoice(env: Env, invoice_id: u64) -> Invoice {
        let invoices: Map<u64, Invoice> = env
            .storage()
            .instance()
            .get(&DataKey::Invoices)
            .expect("no invoices");
        invoices.get(invoice_id).expect("invoice not found")
    }
}

mod test;
