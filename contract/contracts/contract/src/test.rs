#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_create_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let id = client.create_invoice(&creator, &10000i128, &300u32);
    assert_eq!(id, 1);

    let invoice = client.get_invoice(&1u64);
    assert_eq!(invoice.creator, creator);
    assert_eq!(invoice.face_value, 10000i128);
    assert_eq!(invoice.discount_rate, 300u32);
    assert_eq!(invoice.funded, false);
    assert_eq!(invoice.paid, false);
    assert_eq!(invoice.claimed, false);
}

#[test]
fn test_multiple_invoices() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let a = Address::generate(&env);
    let b = Address::generate(&env);

    let id1 = client.create_invoice(&a, &5000i128, &200u32);
    let id2 = client.create_invoice(&b, &8000i128, &500u32);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);

    let inv = client.get_invoice(&2u64);
    assert_eq!(inv.creator, b);
    assert_eq!(inv.face_value, 8000i128);
}

#[test]
fn test_fund_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let factor = Address::generate(&env);

    client.create_invoice(&creator, &10000i128, &300u32);
    let discounted = client.fund_invoice(&factor, &1u64);

    // 10000 * (10000 - 300) / 10000 = 9700
    assert_eq!(discounted, 9700i128);

    let invoice = client.get_invoice(&1u64);
    assert_eq!(invoice.funded, true);
    assert!(invoice.factor.is_some());
    assert_eq!(invoice.factor.unwrap(), factor);
}

#[test]
fn test_mark_paid() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let factor = Address::generate(&env);

    client.create_invoice(&creator, &10000i128, &300u32);
    client.fund_invoice(&factor, &1u64);

    let anyone = Address::generate(&env);
    client.mark_paid(&anyone, &1u64);

    let invoice = client.get_invoice(&1u64);
    assert_eq!(invoice.paid, true);
}

#[test]
fn test_claim_payment() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let factor = Address::generate(&env);

    client.create_invoice(&creator, &10000i128, &300u32);
    client.fund_invoice(&factor, &1u64);
    client.mark_paid(&factor, &1u64);

    let returned = client.claim_payment(&factor, &1u64);
    assert_eq!(returned, 9700i128);

    let invoice = client.get_invoice(&1u64);
    assert_eq!(invoice.claimed, true);
}

#[test]
fn test_full_flow_both_profit() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let biz = Address::generate(&env);
    let factor = Address::generate(&env);

    // Business creates invoice: owed 10000, offers 3% discount
    client.create_invoice(&biz, &10000i128, &300u32);

    // Factor pays 9700, business gets 9700 immediately
    let biz_receives = client.fund_invoice(&factor, &1u64);
    assert_eq!(biz_receives, 9700i128);

    // Debtor pays. Anyone marks it.
    client.mark_paid(&Address::generate(&env), &1u64);

    // Factor claims back their 9700
    let factor_receives = client.claim_payment(&factor, &1u64);
    assert_eq!(factor_receives, 9700i128);

    // Business got 9700 upfront. Factor put in 9700, got 9700 back.
    // The factoring spread is the risk premium, captured at discount time.
}

#[test]
#[should_panic]
fn test_get_nonexistent() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    client.get_invoice(&999u64);
}

#[test]
#[should_panic(expected = "already funded")]
fn test_double_fund() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    client.create_invoice(&Address::generate(&env), &10000i128, &300u32);
    client.fund_invoice(&Address::generate(&env), &1u64);
    client.fund_invoice(&Address::generate(&env), &1u64);
}

#[test]
#[should_panic(expected = "not funded")]
fn test_claim_unfunded() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    client.create_invoice(&Address::generate(&env), &10000i128, &300u32);
    client.claim_payment(&Address::generate(&env), &1u64);
}

#[test]
#[should_panic(expected = "not paid yet")]
fn test_claim_before_paid() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    client.create_invoice(&Address::generate(&env), &10000i128, &300u32);
    client.fund_invoice(&Address::generate(&env), &1u64);
    client.claim_payment(&Address::generate(&env), &1u64);
}

#[test]
#[should_panic(expected = "already claimed")]
fn test_double_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    client.create_invoice(&Address::generate(&env), &10000i128, &300u32);
    let factor = Address::generate(&env);
    client.fund_invoice(&factor, &1u64);
    client.mark_paid(&factor, &1u64);
    client.claim_payment(&factor, &1u64);
    client.claim_payment(&factor, &1u64);
}

#[test]
#[should_panic(expected = "invalid amount")]
fn test_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    client.create_invoice(&Address::generate(&env), &0i128, &300u32);
}

#[test]
#[should_panic(expected = "invalid discount rate")]
fn test_zero_discount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    client.create_invoice(&Address::generate(&env), &10000i128, &0u32);
}

#[test]
#[should_panic(expected = "invalid discount rate")]
fn test_full_discount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    client.create_invoice(&Address::generate(&env), &10000i128, &10000u32);
}

#[test]
fn test_high_discount_rate() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    client.create_invoice(&Address::generate(&env), &10000i128, &5000u32);
    let discounted = client.fund_invoice(&Address::generate(&env), &1u64);
    // 10000 * 50% = 5000
    assert_eq!(discounted, 5000i128);
}
