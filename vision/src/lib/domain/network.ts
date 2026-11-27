/**
 * Diagnóstico de la red del local: ¿hay CGNAT? Compara la IP pública que ve
 * internet con la IP WAN que muestra el módem de Izzi.
 */
export type NetworkVerdict =
  | { kind: "ip_publica"; title: string; detail: string }
  | { kind: "cgnat"; title: string; detail: string }
  | { kind: "doble_nat"; title: string; detail: string }
  | { kind: "nat_proveedor"; title: string; detail: string }
  | { kind: "incompleto"; title: string; detail: string };

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function isIPv4(ip: string): boolean {
  return IPV4.test(ip.trim());
}

function octets(ip: string): number[] {
  return ip.trim().split(".").map(Number);
}

/** 100.64.0.0/10: espacio reservado para CGNAT (RFC 6598). */
export function isCgnatRange(ip: string): boolean {
  const [a, b] = octets(ip);
  return a === 100 && b! >= 64 && b! <= 127;
}

/** 10/8, 172.16/12, 192.168/16 (RFC 1918). */
export function isPrivateRange(ip: string): boolean {
  const [a, b] = octets(ip);
  return a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}

export function networkVerdict(publicIPv4: string | null, wanIp: string): NetworkVerdict {
  const wan = wanIp.trim();
  if (!publicIPv4 || !isIPv4(publicIPv4)) {
    return { kind: "incompleto", title: "Falta la IP pública", detail: "Toca «Medir IP pública» con el iPhone conectado al Wi-Fi del local." };
  }
  if (!isIPv4(wan)) {
    return { kind: "incompleto", title: "Falta la IP WAN del módem", detail: "Escríbela tal como aparece en la página del módem (cuatro números separados por puntos)." };
  }
  if (isCgnatRange(wan)) {
    return {
      kind: "cgnat",
      title: "CGNAT confirmado",
      detail: `La IP WAN del módem (${wan}) está en 100.64.0.0/10, el rango que usan los proveedores para CGNAT. Ninguna conexión desde internet puede llegar a las cámaras abriendo puertos.`,
    };
  }
  if (isPrivateRange(wan)) {
    return {
      kind: "doble_nat",
      title: "Doble NAT",
      detail: `La IP WAN del módem (${wan}) es privada. Hay otro equipo de red (de Izzi o del local) delante del módem; abrir puertos en este módem no basta.`,
    };
  }
  if (wan === publicIPv4.trim()) {
    return {
      kind: "ip_publica",
      title: "IP pública sin CGNAT",
      detail: `El módem tiene la misma IP que ve internet (${wan}). Técnicamente es posible una conexión entrante restringida; falta evaluar la seguridad y si el módem filtra por IP de origen.`,
    };
  }
  return {
    kind: "nat_proveedor",
    title: "NAT del proveedor (probable CGNAT)",
    detail: `El módem dice ${wan}, pero internet ve ${publicIPv4}. El tráfico pasa por un NAT de Izzi: abrir puertos en el módem no funcionará. (Si la IP cambió entre las dos lecturas, repite la prueba.)`,
  };
}

/** Avisa si la medición NO parece hecha desde la red de Izzi. */
export function ispWarning(org: string | null): string | null {
  if (!org) return null;
  const o = org.toLowerCase();
  if (o.includes("megacable")) return "La conexión parece de Megacable (¿la red de casa?). Conéctate al Wi-Fi del local (Izzi) y repite.";
  if (/(telcel|radiomovil|at&t|att |movistar|telefonica|altan|bait)/.test(o)) return "Parece una conexión de datos móviles. Desactiva los datos y conéctate al Wi-Fi del local.";
  return null;
}
