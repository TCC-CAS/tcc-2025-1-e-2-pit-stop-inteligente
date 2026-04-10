// detalhes-tab.js
export function initDetalhes(osId) {
  if (!osId) {
    console.warn("Nenhuma OS selecionada para detalhes.");
    return;
  }
  carregarDetalhes(osId);
}

function formatarCPFouCNPJ(valor) {
  const numeros = valor.replace(/\D/g, "");
  if (numeros.length === 11) {
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  } else if (numeros.length === 14) {
    return numeros.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return valor;
}

async function carregarDetalhes(osId) {
  try {
    const response = await fetch(
      `http://127.0.0.1:8000/api/oficina/os/${osId}/`,
    );
    if (!response.ok) throw new Error("Erro ao carregar detalhes da OS");
    const os = await response.json();

    // Log para depuração
    console.log("Dados da OS recebidos:", os);

    // Preenche campos de cliente e veículo
    document.getElementById("detalhe-cliente-nome").textContent =
      os.veiculo_detalhes?.cliente_detalhes?.nome || "--";

    const doc = os.veiculo_detalhes?.cliente_detalhes?.cpf_cnpj || "--";
    document.getElementById("detalhe-cliente-doc").textContent =
      doc !== "--" ? formatarCPFouCNPJ(doc) : "--";

    document.getElementById("detalhe-veiculo-modelo").textContent =
      os.veiculo_detalhes?.modelo || "--";
    document.getElementById("detalhe-veiculo-placa").textContent =
      os.veiculo_detalhes?.placa || "--";

    // KM Atual
    const km =
      os.km_atual !== undefined && os.km_atual !== null
        ? `${os.km_atual} km`
        : "--";
    document.getElementById("detalhe-veiculo-km").textContent = km;

    // Ano / Cor
    const ano = os.veiculo_detalhes?.ano || "--";
    const cor = os.veiculo_detalhes?.cor || "--";
    document.getElementById("detalhe-veiculo-ano-cor").textContent =
      `${ano} / ${cor}`;

    carregarChecklistResumo(osId);
  } catch (error) {
    console.error("Erro ao carregar detalhes:", error);
  }
}

async function carregarChecklistResumo(osId) {
    const tbody = document.getElementById("checklist-body");
    if (!tbody) return;
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/checklist/`);
        if (response.ok) {
            const checklist = await response.json();
            const itens = [
                { nome: "Data Recebimento", valor: checklist.data_recebimento || "-", status: "OK", obs: "" },
                { nome: "Consultor", valor: checklist.consultor || "-", status: "OK", obs: "" },
                { nome: "Nível Combustível", valor: checklist.nivel_combustivel || "-", status: "OK", obs: "" },
                { nome: "Lataria/Pintura", valor: checklist.lataria_pintura || "-", status: "OK", obs: checklist.lataria_pintura || "" },
                { nome: "Vidros/Faróis", valor: checklist.vidros_farois || "-", status: "OK", obs: checklist.vidros_farois || "" },
                { nome: "Nível Óleo", valor: checklist.nivel_oleo || "-", status: "OK", obs: "" },
                { nome: "Fluido Arrefecimento", valor: checklist.fluido_arrefecimento || "-", status: "OK", obs: "" },
                { nome: "Observações Iniciais", valor: checklist.observacoes_iniciais || "-", status: "OK", obs: checklist.observacoes_iniciais || "" }
            ];
            tbody.innerHTML = itens
                .map(item => `
                    <tr>
                        <td>${item.nome}</td>
                        <td>${item.status}</td>
                        <td>${item.valor}</td>
                    </tr>
                `).join("");
        } else {
            tbody.innerHTML = '<tr><td colspan="3">Checklist não encontrado.</td></tr>';
        }
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar checklist.</td></tr>';
    }
}
