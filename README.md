# Precios y rentabilidad · Grupo Bitek

Sistema de control de precios de venta y rentabilidad por marketplace.
Frontend estático en GitHub Pages, Google Sheets como base de datos, Apps Script
como API.

---

## Puesta en marcha

### 1. Backend (Apps Script)

1. Abrí el proyecto de Apps Script y pegá **`Code.gs`** completo.
2. El `SPREADSHEET_ID` ya está configurado. Cambiá el `WRITE_TOKEN` por una
   cadena propia.
3. Ejecutá **`bootstrap()`** desde el editor. Crea las 11 pestañas y carga:
   9 parámetros, 5 canales, 25 filas de financiación, 202 tarifas,
   40 productos, 120 configuraciones por canal y 108 publicaciones.
4. **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión**.
   Usá "Administrar implementaciones", **no** "Nueva implementación": así se
   conserva la URL `/exec` que ya está en uso.
5. Verificá que quede en **Ejecutar como: Yo** y **Acceso: Cualquier persona**.
6. Ejecutá **`diagnostico()`** para ver si falta algún dato.

`bootstrap()` es idempotente: se puede volver a correr sin duplicar nada.

### 2. Frontend (GitHub Pages)

Subí todo el contenido de esta carpeta a la raíz del repositorio y activá
Pages sobre la rama principal.

En **`src/data/api.js`** hay tres valores para ajustar:

| Constante | Qué hacer |
|---|---|
| `API_URL` | La URL `/exec` del Apps Script |
| `WRITE_TOKEN` | El mismo que pusiste en `Code.gs` |
| `USAR_DATOS_LOCALES` | Ponelo en `false` una vez desplegado el backend |

Mientras `USAR_DATOS_LOCALES` esté en `true`, la app funciona con
`data/demo.json` y se puede navegar completa sin haber desplegado nada. Los
cambios no se guardan y la app lo avisa.

### 3. Probar en la máquina

Los módulos ES no funcionan abriendo el archivo con doble clic (`file://` los
bloquea). Hay que levantar un servidor:

```bash
python3 -m http.server 8080
```

Y abrir `http://localhost:8080`.

---

## Estructura

```
index.html                        Shell y sistema de diseño
data/demo.json                    Dataset de ejemplo
Code.gs                           Backend: API, bootstrap, auditoría
src/
  core/                           Motor de cálculo. Puro, sin DOM ni red
    money.js                      IVA, netos y cargos porcentuales
    tarifas.js                    Escalones de peso y peso volumétrico
    engine.js                     Rentabilidad, precio sugerido, despeje inverso
    marketplaces/
      meli.js                     Régimen dual, ME1, volumétrico manual
      feeLogistico.js             Fábrica para canales con fee por peso
      index.js                    Registro de los cinco canales
  data/
    api.js                        Única salida a la red
    store.js                      Estado en memoria y recálculo
  ui/
    app.js                        Router y arranque
    format.js                     Números y barra de margen
    componentes.js                Tabla, panel, filtros, CSV
    views/                        Una pantalla por archivo
test-engine.js                    10 escenarios de validación del motor
integra-test.js                   Motor corriendo sobre el dataset sembrado
```

Para correr las validaciones hace falta un `package.json` con
`{"type": "module"}` en la raíz, y después `node test-engine.js`.

---

## Cómo funciona el cálculo

Todo precio se ingresa y se guarda **con IVA incluido**. El motor trabaja en
valores netos, porque el costo del producto es nacionalizado sin IVA y el IVA de
comisiones, logística y publicidad es crédito fiscal.

```
Ingreso neto        = PVP c/IVA / 1,21

− Comisión            ML:                 tasa / 1,21 × PVP
                      Frávega/OnCity/BNA: tasa × PVP
− Costo financiero    mismo tratamiento de IVA que la comisión
− Logística           tarifa c/IVA / 1,21
− Cargo fijo (ML)     cargo c/IVA / 1,21
− IIBB                4% × PVP c/IVA          ← bruto, sin crédito
− Imp. Déb/Créd       1,2% × PVP c/IVA        ← bruto, sin crédito
− Publicidad          pub% / 1,21 × PVP
− Gastos varios       var% / 1,21 × PVP
− Costo producto      USD × TC
─────────────────────────────
= Utilidad neta
```

Dos consecuencias que conviene tener presentes:

**La misma tasa cuesta distinto según el canal.** En MercadoLibre la tasa
publicada ya contiene IVA, así que 15% sobre $100 cuesta $12,40. En Frávega la
tasa se aplica y después se le suma IVA, así que 15% sobre $100 cuesta $15,00.
Las tasas nominales no son comparables entre canales.

**IIBB y débito/crédito van sobre el precio con IVA.** No generan crédito
fiscal, así que no se netean. Es el punto donde el sistema se aparta de la
planilla original.

**Precios en cuotas.** Cada modalidad se calcula desde el precio de contado,
nunca desde la modalidad anterior.

---

## Tablas de tarifas

Cinco tablas, todas con la misma estructura: escalón de peso × tramo de precio →
tarifa con IVA. Agregar un escalón es agregar una fila en el Sheets.

- **MercadoLibre**: envío (PVP ≥ umbral) y cargo fijo (PVP < umbral), 27
  escalones cada una, de 0 a "más de 180 kg".
- **Frávega y OnCity**: fee logístico, 12 escalones, corte por monto de orden en
  $35.000.
- **ViaCompras**: 19 escalones, tarifario 01-JUL-26.
- **Tienda BNA**: preparada, sin cargar.

Convención de bordes: el peso mínimo es **excluyente** y el máximo
**incluyente**. Un bulto de 5,0 kg entra en el escalón "1 a 5 kg"; uno de 5,1 kg
pasa al siguiente. Los tramos de precio van al revés, como los publican los
canales: "$33.000 a $49.999" incluye el mínimo y excluye el máximo.

---

## Pendientes conocidos

- **Financiación de 18 cuotas**: falta el costo real en los cinco canales.
- **Frávega, OnCity, ViaCompras y BNA** arrancan con los costos financieros de
  MercadoLibre como punto de partida. Hay que reemplazarlos por los reales.
- **Envío ME1** de los grupos electrógenos KTG39 y KTG56: cargado con $60.500 y
  $84.700, que son los valores de la planilla convertidos a con IVA. Verificar.
- **SKU 30008** (Combo Ventilador): no figuraba en la hoja de pesos. Tiene las
  medidas del 30006; hay que cargar las del bulto real del combo.
- **Markups en plazos largos**: con 8,5% plano, el margen a 12 cuotas queda por
  debajo del de contado, porque el costo financiero se cobra sobre el precio ya
  recargado. Los markups son configurables por modalidad.
