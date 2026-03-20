let cache = {};

export default async function handler(req, res) {
  const { linha = "000" } = req.query;
  const now = Date.now();

  // cache por linha (10s)
  if (cache[linha] && now - cache[linha].time < 10000) {
    return res.status(200).json(cache[linha].data);
  }

  const url = "https://rmtcgoiania.com.br/index.php";

  const params = new URLSearchParams({
    option: "com_rmtclinhas",
    view: "cconaweb",
    format: "json",
    linha: String(linha).padStart(3, "0")
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://rmtcgoiania.com.br/"
      }
    });

    const data = await response.json();

    const onibus = (data.onibus || [])
      .filter(bus =>
        bus.Situacao !== "ForaServico" &&
        bus.Situacao !== "Intervalo"
      )
      .map(bus => ({
        numero: bus.Numero,
        lat: bus.Latitude,
        lng: bus.Longitude,
        destino: bus.Destino?.DestinoCurto || "N/A",
        status: bus.Situacao,
        linha: bus.Linha?.LinhaNumero
      }));

    cache[linha] = {
      data: onibus,
      time: now
    };

    res.status(200).json(onibus);

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
}
