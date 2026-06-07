fn main() {
    let contract = celepkg_lib::api_contract::export_contract();
    println!("{}", serde_json::to_string_pretty(&contract).unwrap());
}
