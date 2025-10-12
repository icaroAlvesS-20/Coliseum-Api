import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Configuração do Prisma para Vercel
const isVercel = process.env.VERCEL === '1';

const prisma = new PrismaClient({
  log: isVercel ? ['error'] : ['warn', 'error'],
  errorFormat: 'minimal'
});

// ✅ CORS para Vercel
app.use(cors({
  origin: true, // Permite todas as origins no Vercel
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// ========== ROTAS ========== //

// ✅ ROTA RAIZ
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Coliseum Online no Vercel!',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET  /api/health',
      'GET  /api/ranking',
      'POST /api/usuarios'
    ]
  });
});

// ✅ HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'online', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// ✅ RANKING
app.get('/api/ranking', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        pontuacao: true,
        desafiosCompletados: true,
      },
      orderBy: { 
        pontuacao: 'desc' 
      }
    });

    const ranking = usuarios.map((user, index) => ({
      ...user,
      posicao: index + 1
    }));
    
    res.json(ranking);
  } catch (error) {
    console.error('Erro ao buscar ranking:', error);
    res.status(500).json({ 
      error: 'Erro ao carregar ranking'
    });
  }
});

// ✅ LOGIN/CADASTRO
app.post('/api/usuarios', async (req, res) => {
  try {
    const { ra, nome, senha, serie, action = 'login' } = req.body;
    
    if (!ra) {
      return res.status(400).json({ error: 'RA é obrigatório' });
    }

    if (action === 'cadastro') {
      const novoUsuario = await prisma.usuario.create({
        data: {
          ra: ra.toString().trim(),
          nome: nome.trim(),
          senha: senha,
          serie: serie.toString().trim(),
          pontuacao: 0,
          desafiosCompletados: 0
        }
      });

      res.json({
        success: true,
        message: `Cadastro realizado! Bem-vindo, ${nome}!`,
        usuario: novoUsuario
      });
    } else {
      const usuario = await prisma.usuario.findFirst({
        where: {
          ra: ra.toString().trim(),
          senha: senha
        }
      });

      if (!usuario) {
        return res.status(401).json({ 
          error: 'RA ou senha incorretos' 
        });
      }

      res.json({
        success: true,
        message: `Login realizado! Bem-vindo de volta, ${usuario.nome}!`,
        usuario: usuario
      });
    }
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'RA já cadastrado' 
      });
    }
    res.status(500).json({ 
      error: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTA DE FALLBACK
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// ✅ INICIALIZAÇÃO
async function startServer() {
  try {
    await prisma.$connect();
    console.log('✅ Conectado ao PostgreSQL');
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();

export default app;
