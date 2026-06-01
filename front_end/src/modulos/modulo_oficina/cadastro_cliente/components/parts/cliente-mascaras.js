// cliente-mascaras.js
//
// Aplica máscaras nos inputs do formulário de cliente (CPF/CNPJ, telefone, CEP).
// Cada máscara é vinculada uma única vez ao chamar `aplicarMascarasFormCliente`.

export function aplicarMascarasFormCliente() {
  vincularMascara("documento", mascararCpfCnpj);
  vincularMascara("telefone", mascararTelefone);
  vincularMascara("cep", mascararCep);
}


function vincularMascara(id, transformador) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("input", (e) => {
    e.target.value = transformador(e.target.value);
  });
}


function mascararCpfCnpj(valor) {
  let v = valor.replace(/\D/g, "");
  if (v.length > 14) v = v.slice(0, 14);

  if (v.length > 11) {
    return v
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return v
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}


function mascararTelefone(valor) {
  return valor
    .replace(/\D/g, "")
    .replace(/^(\d{2})(\d)/g, "($1) $2")
    .replace(/(\d)(\d{4})$/, "$1-$2");
}


function mascararCep(valor) {
  return valor.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2");
}
