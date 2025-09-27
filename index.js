
// ============================================================
// 🧾 PROYECTO: Descargar XML del SRI
// AUTOR: ALEX ZAMBRANO
// LENGUAJE: JavaScript (Node.js)
// ============================================================

// 1) Importamos librerías necesarias
import fs from "fs";              // Para leer y guardar archivos
import path from "path";          // Para manejar rutas de carpetas
import fetch from "node-fetch";   // Para conectarnos a internet (instalar con: npm install node-fetch)

// 2) Configuraciones iniciales
const carpetaTXT = "./data";                                // Carpeta donde están los TXT
const carpetaDescargas = "./descargas";                     // Carpeta donde se guardarán los XML
const urlSRI = "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline"; // Web Service del SRI

// 3) Función para leer un archivo TXT y convertirlo en una lista de facturas
function leerArchivoTXT(ruta) {
  const contenido = fs.readFileSync(ruta, "utf8");
  const lineas = contenido.split("\n").filter(l => l.trim() !== "");
  if (lineas.length < 2) return [];

  const cabecera = lineas[0].split("\t");

  return lineas.slice(1).map(linea => {
    const valores = linea.split("\t");
    const objeto = {};
    cabecera.forEach((columna, i) => {
      objeto[columna.trim()] = valores[i] ? valores[i].trim() : "";
    });
    return objeto;
  });
}

// 4) Armamos el mensaje que pide el XML al SRI (SOAP Request)
function crearPeticionSOAP(claveAcceso) {
  return `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                    xmlns:ec="http://ec.gob.sri.ws.autorizacion">
    <soapenv:Header/>
    <soapenv:Body>
      <ec:autorizacionComprobante>
        <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
      </ec:autorizacionComprobante>
    </soapenv:Body>
  </soapenv:Envelope>`;
}

// 5) Consultar un comprobante en el SRI
async function consultarSRI(claveAcceso) {
  try {
    const respuesta = await fetch(urlSRI, {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8" },
      body: crearPeticionSOAP(claveAcceso),
    });
    return await respuesta.text();
  } catch (error) {
    console.error("❌ Error consultando SRI:", error);
    return null;
  }
}

// 6) Guardar el XML en una carpeta organizada
function guardarXML(tipo, emisor, receptor, clave, xml) {
  const carpetaDestino = path.join(carpetaDescargas, tipo, `${emisor}_${receptor}`);
  fs.mkdirSync(carpetaDestino, { recursive: true });

  const archivoDestino = path.join(carpetaDestino, `${clave}.xml`);
  fs.writeFileSync(archivoDestino, xml, "utf8");
  console.log(`✅ Guardado: ${archivoDestino}`);
}

async function main() {
  console.log("🚀 Iniciando descarga de XML del SRI...");

  // Leer todos los TXT de la carpeta
  let archivosTXT = [];
  try {
    archivosTXT = fs.readdirSync(carpetaTXT).filter(f => f.endsWith(".txt"));
  } catch (err) {
    console.error("❌ Error leyendo la carpeta de TXT:", err);
    return;
  }

  if (archivosTXT.length === 0) {
    console.log("⚠️ No se encontraron archivos TXT en la carpeta:", carpetaTXT);
    return;
  }

  // Contadores globales
  let total = 0;
  let descargados = 0;
  let noDescargados = 0;

  // Primer bucle: recorre cada archivo TXT
  for (const archivo of archivosTXT) {
    const rutaArchivo = path.join(carpetaTXT, archivo);
    console.log(`📂 Procesando archivo: ${archivo}`);

    let comprobantes = [];
    try {
      comprobantes = leerArchivoTXT(rutaArchivo);
    } catch (err) {
      console.error("❌ Error leyendo archivo:", rutaArchivo, err);
      continue;
    }

    total += comprobantes.length;

    // Segundo bucle: recorre cada comprobante del archivo
    for (const comp of comprobantes) {
      // Validamos y asignamos valores por defecto para evitar errores
      const clave = comp["CLAVE_ACCESO"] || null;
      const tipo = comp["TIPO_COMPROBANTE"] || "SIN_TIPO";
      const emisor = comp["RUC_EMISOR"] || "SIN_EMISOR";
      const receptor = comp["IDENTIFICACION_RECEPTOR"] || "SIN_RECEPTOR";

      if (!clave) {
        console.log("⚠️ Registro sin CLAVE_ACCESO, se omite:", comp);
        noDescargados++;
        continue;
      }

      console.log(`🔎 Consultando clave: ${clave} ...`);

      let xml = null;
      try {
        xml = await consultarSRI(clave);
      } catch (err) {
        console.error("❌ Error consultando SRI para clave:", clave, err);
      }

      // Verificamos si la respuesta es válida y contiene autorización
      if (xml && xml.includes("<autorizacion>")) {
        try {
          guardarXML(tipo, emisor, receptor, clave, xml);
          descargados++;
        } catch (err) {
          console.error("❌ Error guardando XML autorizado:", err);
          noDescargados++;
        }
      } else {
        // Guardamos XML en carpeta NO_AUTORIZADO si no vino autorizado
        try {
          guardarXML("NO_AUTORIZADO", emisor, receptor, clave, xml || "<error>Sin respuesta</error>");
        } catch (err) {
          console.error("❌ Error guardando XML NO_AUTORIZADO:", err);
        }
        console.log(`⚠️ Comprobante no autorizado o no encontrado: ${clave}`);
        noDescargados++;
      }
    }
  }

  // Resumen final
  console.log("===================================");
  console.log("📊 RESUMEN");
  console.log(`Total comprobantes: ${total}`);
  console.log(`Descargados: ${descargados}`);
  console.log(`No descargados: ${noDescargados}`);
  console.log("===================================");
}

// 8) Ejecutamos el programa
main();
