export type CheckoutAddress = { cep: string; street: string; number: string; district: string; city: string; state: string };

const STATES = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function isCompleteAddress(address: CheckoutAddress): boolean {
  return address.cep.replace(/\D/g, "").length === 8
    && address.street.trim().length >= 2
    && address.number.trim().length > 0
    && address.district.trim().length >= 2
    && address.city.trim().length >= 2
    && STATES.has(address.state.trim().toUpperCase());
}