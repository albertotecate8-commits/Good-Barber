import { describe, expect, it } from "vitest";
import { ispWarning, networkVerdict } from "./network";

describe("diagnóstico de CGNAT", () => {
  it("rango 100.64/10 → CGNAT", () => {
    expect(networkVerdict("189.200.10.5", "100.72.15.3").kind).toBe("cgnat");
    expect(networkVerdict("189.200.10.5", "100.127.255.1").kind).toBe("cgnat");
    expect(networkVerdict("189.200.10.5", "100.128.0.1").kind).not.toBe("cgnat");
  });
  it("WAN privada → doble NAT", () => {
    expect(networkVerdict("189.200.10.5", "10.20.30.40").kind).toBe("doble_nat");
    expect(networkVerdict("189.200.10.5", "192.168.1.254").kind).toBe("doble_nat");
    expect(networkVerdict("189.200.10.5", "172.20.0.1").kind).toBe("doble_nat");
  });
  it("misma IP → IP pública", () => {
    expect(networkVerdict("189.200.10.5", " 189.200.10.5 ").kind).toBe("ip_publica");
  });
  it("públicas distintas → NAT del proveedor", () => {
    expect(networkVerdict("189.200.10.5", "201.141.2.3").kind).toBe("nat_proveedor");
  });
  it("datos incompletos", () => {
    expect(networkVerdict(null, "1.2.3.4").kind).toBe("incompleto");
    expect(networkVerdict("189.200.10.5", "abc").kind).toBe("incompleto");
  });
  it("avisa si no es Izzi", () => {
    expect(ispWarning("Megacable Comunicaciones de Mexico")).toMatch(/Megacable/);
    expect(ispWarning("Radiomovil Dipsa (Telcel)")).toMatch(/datos móviles/);
    expect(ispWarning("Cablevision S.A. de C.V. (izzi)")).toBeNull();
  });
});
