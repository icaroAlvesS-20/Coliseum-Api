import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Configuração de paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ SERVIR ARQUIVOS ESTÁTICOS DO FRONTEND
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'src')));

// ✅ ROTAS DO SEU FRONTEND (SPA - Single Page Application)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/ranking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/perfil', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/desafios', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== ROTAS API (BACKEND) ========== //
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'API Coliseum funcionando!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/ranking', async (req, res) => {
  try {
    const prisma = new PrismaClient();
    const usuarios = await prisma.usuario.findMany({
      orderBy: { pontuacao: 'desc' }
    });
    
    const rankingComPosicoes = usuarios.map((user, index) => ({
      ...user,
      posicao: index + 1
    }));
    
    res.json(rankingComPosicoes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar ranking' });
  }
});

// ✅ ROTA DE FALLBACK - sempre retorna o frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando: http://localhost:${PORT}`);
  console.log(`📁 Frontend servido de: ${__dirname}/public`);
});

export default app;
