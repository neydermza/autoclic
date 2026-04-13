const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const upload = multer({ storage: multer.memoryStorage() });

let vehiculos = [
  { id: 1, tipo: "Carro", marca: "Toyota", referencia: "Corolla", anio: 2021, precio: "$52.000.000", ciudad: "Bogotá", km: "38.000 km", desc: "Perfecto estado, único dueño.", tel: "310 555 7890", owner: "Carlos R.", fotos: [] },
  { id: 2, tipo: "Moto", marca: "Honda", referencia: "CB 190R", anio: 2022, precio: "$9.800.000", ciudad: "Medellín", km: "12.000 km", desc: "SOAT y tecno al día.", tel: "315 432 1100", owner: "Daniela M.", fotos: [] },
  { id: 3, tipo: "Camioneta", marca: "Chevrolet", referencia: "Blazer", anio: 2020, precio: "$85.000.000", ciudad: "Cali", km: "55.000 km", desc: "4x4, turbo, cámara de reversa.", tel: "321 789 4455", owner: "Andrés P.", fotos: [] },
];

app.get('/api/vehiculos', (req, res) => {
  const lista = vehiculos.map(({ tel, ...v }) => v);
  res.json(lista);
});

app.post('/api/vehiculos', upload.array('fotos', 20), async (req, res) => {
  try {
    const fotos = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'autoclic', resource_type: 'image' },
            (error, result) => error ? reject(error) : resolve(result)
          ).end(file.buffer);
        });
        fotos.push(result.secure_url);
      }
    }
    const v = {
      id: Date.now(),
      tipo: req.body.tipo,
      marca: req.body.marca,
      referencia: req.body.referencia || '',
      anio: req.body.anio,
      precio: '$' + req.body.precio,
      ciudad: req.body.ciudad,
      km: req.body.km,
      desc: req.body.desc,
      owner: req.body.owner,
      tel: req.body.tel,
      fotos
    };
    vehiculos.unshift(v);
    res.json({ ok: true, id: v.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error subiendo fotos' });
  }
});

app.post('/api/pagar', async (req, res) => {
  const { vehiculoId } = req.body;
  const vehiculo = vehiculos.find(v => v.id == vehiculoId);
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });
  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [{
          title: `Contacto: ${vehiculo.marca} ${vehiculo.referencia} ${vehiculo.anio}`,
          quantity: 1,
          unit_price: 10000,
          currency_id: 'COP'
        }],
        back_urls: {
          success: `http://localhost:3000?pago=ok&vid=${vehiculoId}`,
          failure: `http://localhost:3000`,
          pending: `http://localhost:3000`
        },
        auto_return: 'approved',
        metadata: { vehiculoId }
      }
    });
    res.json({ init_point: result.init_point });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error creando pago' });
  }
});

app.get('/api/telefono/:id', (req, res) => {
  const vehiculo = vehiculos.find(v => v.id == req.params.id);
  if (!vehiculo) return res.status(404).json({ error: 'No encontrado' });
  res.json({ tel: vehiculo.tel, owner: vehiculo.owner });
});

app.listen(3000, () => console.log('AutoClic corriendo en http://localhost:3000'));