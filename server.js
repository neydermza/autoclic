const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');
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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const upload = multer({ storage: multer.memoryStorage() });

// GET todos los vehículos (sin teléfono)
app.get('/api/vehiculos', async (req, res) => {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('id, marca, modelo, anio, precio, kilometraje, descripcion, ciudad, fotos, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST crear vehículo
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

    const { data, error } = await supabase.from('vehiculos').insert([{
      marca: req.body.marca,
      modelo: req.body.referencia || req.body.modelo || '',
      anio: parseInt(req.body.anio),
      precio: parseInt(req.body.precio),
      kilometraje: parseInt(req.body.km) || 0,
      descripcion: req.body.desc || req.body.descripcion || '',
      telefono: req.body.tel,
      ciudad: req.body.ciudad,
      fotos
    }]).select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, id: data[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error subiendo fotos' });
  }
});

// POST pagar
app.post('/api/pagar', async (req, res) => {
  const { vehiculoId } = req.body;

  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('id', vehiculoId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Vehículo no encontrado' });

  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [{
          title: `Contacto: ${data.marca} ${data.modelo} ${data.anio}`,
          quantity: 1,
          unit_price: 10000,
          currency_id: 'COP'
        }],
        back_urls: {
          success: `https://autoclic-production.up.railway.app?pago=ok&vid=${vehiculoId}`,
          failure: `https://autoclic-production.up.railway.app`,
          pending: `https://autoclic-production.up.railway.app`
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

// GET teléfono después de pagar
app.get('/api/telefono/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('telefono, marca, modelo')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'No encontrado' });
  res.json({ tel: data.telefono, owner: `${data.marca} ${data.modelo}` });
});

app.listen(process.env.PORT || 3000, () => console.log('AutoClic corriendo'));
