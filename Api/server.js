import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

const prisma = new PrismaClient();

// ========== CONFIGURAÇÃO CORS ========== //
const allowedOrigins = [
  'https://coliseum-frontend.vercel.app',
  'https://coliseum-adm.vercel.app',
  'https://coliseum-7raywxzsu-icaroass-projects.vercel.app',
  'https://coliseum-of2dynr3p-icaroass-projects.vercel.app',
  'https://coliseum-6hm18oy24-icaroass-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://coliseum-*.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requisições sem origin (mobile apps, curl, etc)
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Em desenvolvimento, permitir todas as origens
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Verificar se a origin está na lista ou é um subdomínio vercel
    if (allowedOrigins.some(allowed => origin === allowed) || 
        origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.log('🚫 CORS bloqueado para origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ========== MIDDLEWARES ========== //
app.use(express.json({ limit: '10mb' }));

// Log de requisições
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  req.requestId = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// ========== ROTAS BÁSICAS ========== //
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Coliseum API - Online',
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: 'connected'
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const [totalUsuarios, totalDesafios, totalVideos] = await Promise.all([
      prisma.usuario.count().catch(() => 0),
      prisma.desafio.count().catch(() => 0),
      prisma.video.count().catch(() => 0)
    ]);

    res.json({
      status: 'healthy',
      database: 'connected',
      stats: {
        usuarios: totalUsuarios,
        desafios: totalDesafios,
        videos: totalVideos
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== USUÁRIOS ========== //
// Login
app.post('/api/login', async (req, res) => {
  try {
    const { ra, senha } = req.body;

    if (!ra || !senha) {
      return res.status(400).json({
        success: false,
        error: 'RA e senha são obrigatórios'
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { ra: ra.toString().trim() }
    });

    if (!usuario) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    if (usuario.status !== 'ativo') {
      return res.status(403).json({
        success: false,
        error: 'Usuário inativo. Contate o administrador.'
      });
    }

    if (usuario.senha !== senha.trim()) {
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }

    // Retornar sem a senha
    const { senha: _, ...usuarioSemSenha } = usuario;

    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      usuario: usuarioSemSenha,
      token: usuario.id.toString()
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Todos os usuários
app.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        curso: true,
        pontuacao: true,
        desafiosCompletados: true,
        status: true,
        criadoEm: true,
        atualizadoEm: true
      },
      orderBy: { criadoEm: 'desc' }
    });

    res.json(usuarios);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro ao carregar usuários' });
  }
});

// Criar usuário
app.post('/api/usuarios', async (req, res) => {
  try {
    const { nome, ra, serie, senha, curso = 'matematica', status = 'ativo' } = req.body;

    if (!nome || !ra || !serie || !senha) {
      return res.status(400).json({
        error: 'Dados incompletos',
        required: ['nome', 'ra', 'serie', 'senha']
      });
    }

    // Verificar se RA já existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { ra: ra.toString().trim() }
    });

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'RA já cadastrado',
        details: `O RA ${ra} já está em uso`
      });
    }

    const novoUsuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        ra: ra.toString().trim(),
        serie: serie.trim(),
        senha: senha.trim(),
        curso: curso.trim(),
        status: status,
        pontuacao: 0,
        desafiosCompletados: 0,
        criadoEm: new Date(),
        atualizadoEm: new Date()
      }
    });

    const { senha: _, ...usuarioSemSenha } = novoUsuario;

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      usuario: usuarioSemSenha
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Atualizar usuário
app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { nome, ra, serie, curso, pontuacao, desafiosCompletados, status } = req.body;

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const updateData = {
      atualizadoEm: new Date()
    };

    if (nome !== undefined) updateData.nome = nome.trim();
    if (ra !== undefined) updateData.ra = ra.toString().trim();
    if (serie !== undefined) updateData.serie = serie.trim();
    if (curso !== undefined) updateData.curso = curso.trim();
    if (pontuacao !== undefined) updateData.pontuacao = parseInt(pontuacao);
    if (desafiosCompletados !== undefined) updateData.desafiosCompletados = parseInt(desafiosCompletados);
    if (status !== undefined) updateData.status = status;

    const usuarioAtualizado = await prisma.usuario.update({
      where: { id: userId },
      data: updateData
    });

    const { senha, ...usuarioSemSenha } = usuarioAtualizado;

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!',
      usuario: usuarioSemSenha
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// ========== RANKING ========== //
app.get('/api/ranking', async (req, res) => {
  try {
    const ranking = await prisma.usuario.findMany({
      where: {
        status: 'ativo'
      },
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        curso: true,
        pontuacao: true,
        desafiosCompletados: true
      },
      orderBy: { pontuacao: 'desc' },
      take: 100
    });

    res.json(ranking);
  } catch (error) {
    console.error('Erro ao gerar ranking:', error);
    res.status(500).json({ error: 'Erro ao carregar ranking' });
  }
});

// ========== DESAFIOS ========== //
// Desafios ativos
app.get('/api/desafios-ativos', async (req, res) => {
  try {
    const agora = new Date();
    
    const desafios = await prisma.desafio.findMany({
      where: {
        AND: [
          { status: 'ativo' },
          {
            OR: [
              { dataInicio: null },
              { dataInicio: { lte: agora } }
            ]
          },
          {
            OR: [
              { dataFim: null },
              { dataFim: { gte: agora } }
            ]
          }
        ]
      },
      select: {
        id: true,
        titulo: true,
        materia: true,
        nivel: true,
        pontuacao: true,
        duracao: true,
        descricao: true,
        maxTentativas: true,
        dataFim: true,
        _count: {
          select: { perguntas: true }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    res.json(desafios);
  } catch (error) {
    console.error('Erro ao buscar desafios:', error);
    res.status(500).json({ error: 'Erro ao carregar desafios' });
  }
});

// Perguntas de um desafio
app.get('/api/desafios/:id/perguntas', async (req, res) => {
  try {
    const desafioId = parseInt(req.params.id);
    
    if (!desafioId || isNaN(desafioId)) {
      return res.status(400).json({ error: 'ID do desafio inválido' });
    }

    const desafio = await prisma.desafio.findUnique({
      where: { 
        id: desafioId,
        status: 'ativo'
      },
      select: {
        id: true,
        titulo: true,
        pontuacao: true,
        duracao: true,
        maxTentativas: true,
        perguntas: {
          where: { ativo: true },
          select: {
            id: true,
            pergunta: true,
            alternativaA: true,
            alternativaB: true,
            alternativaC: true,
            alternativaD: true,
            ordem: true
          },
          orderBy: { ordem: 'asc' }
        }
      }
    });

    if (!desafio) {
      return res.status(404).json({ 
        error: 'Desafio não encontrado ou inativo',
        message: 'Este desafio não está disponível no momento'
      });
    }

    // Embaralhar alternativas
    const perguntasEmbaralhadas = desafio.perguntas.map(pergunta => {
      const alternativas = [
        { letra: 'A', texto: pergunta.alternativaA },
        { letra: 'B', texto: pergunta.alternativaB },
        { letra: 'C', texto: pergunta.alternativaC },
        { letra: 'D', texto: pergunta.alternativaD }
      ];
      
      const alternativasEmbaralhadas = [...alternativas].sort(() => Math.random() - 0.5);
      
      return {
        id: pergunta.id,
        pergunta: pergunta.pergunta,
        alternativas: alternativasEmbaralhadas,
        ordem: pergunta.ordem
      };
    });

    res.json({
      ...desafio,
      perguntas: perguntasEmbaralhadas
    });

  } catch (error) {
    console.error('Erro ao carregar perguntas:', error);
    res.status(500).json({ error: 'Erro ao carregar perguntas do desafio' });
  }
});

// Verificar respostas
app.post('/api/desafios/:id/verificar', async (req, res) => {
  try {
    const desafioId = parseInt(req.params.id);
    const { usuarioId, respostas } = req.body;
    
    if (!usuarioId || !respostas || !Array.isArray(respostas)) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        details: 'Forneça usuarioId e um array de respostas'
      });
    }

    const userId = parseInt(usuarioId);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const desafio = await prisma.desafio.findUnique({
      where: { 
        id: desafioId,
        status: 'ativo'
      },
      include: {
        perguntas: {
          where: { ativo: true },
          orderBy: { ordem: 'asc' }
        }
      }
    });

    if (!desafio) {
      return res.status(404).json({ 
        error: 'Desafio não encontrado ou inativo',
        message: 'Este desafio não está mais disponível'
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { 
        id: userId,
        status: 'ativo'
      }
    });

    if (!usuario) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado ou inativo',
        message: 'Sua conta não está ativa'
      });
    }

    // Verificar se já completou o número máximo de tentativas
    const historicoTentativas = await prisma.historicoDesafio.count({
      where: {
        usuarioId: userId,
        desafioId: desafioId
      }
    });

    if (desafio.maxTentativas > 0 && historicoTentativas >= desafio.maxTentativas) {
      return res.status(400).json({ 
        error: 'Limite de tentativas excedido',
        details: `Você já completou o número máximo de tentativas (${desafio.maxTentativas}) para este desafio`
      });
    }

    const agora = new Date();
    if (desafio.dataFim && new Date(desafio.dataFim) < agora) {
      return res.status(400).json({ 
        error: 'Desafio expirado',
        details: 'O prazo para realizar este desafio já terminou'
      });
    }

    // Verificar respostas
    let acertos = 0;
    
    for (let i = 0; i < desafio.perguntas.length; i++) {
      const pergunta = desafio.perguntas[i];
      const respostaUsuario = respostas[i];
      
      if (respostaUsuario === pergunta.correta) {
        acertos++;
      }
    }

    const porcentagemAcerto = (acertos / desafio.perguntas.length) * 100;
    
    // Calcular pontuação baseada no desempenho
    let pontuacaoGanha = desafio.pontuacao;
    
    if (porcentagemAcerto < 50) {
      pontuacaoGanha = Math.floor(pontuacaoGanha * 0.5);
    } else if (porcentagemAcerto < 75) {
      pontuacaoGanha = Math.floor(pontuacaoGanha * 0.75);
    } else if (porcentagemAcerto < 90) {
      pontuacaoGanha = Math.floor(pontuacaoGanha * 0.9);
    }
    
    // Bônus por resposta perfeita
    if (acertos === desafio.perguntas.length) {
      pontuacaoGanha += Math.floor(pontuacaoGanha * 0.2);
    }

    // Atualizar usuário
    const usuarioAtualizado = await prisma.usuario.update({
      where: { id: userId },
      data: {
        pontuacao: usuario.pontuacao + pontuacaoGanha,
        desafiosCompletados: usuario.desafiosCompletados + 1,
        atualizadoEm: new Date()
      }
    });

    // Salvar histórico
    await prisma.historicoDesafio.create({
      data: {
        usuarioId: userId,
        desafioId: desafioId,
        pontuacaoGanha: pontuacaoGanha,
        acertos: acertos,
        totalPerguntas: desafio.perguntas.length,
        porcentagemAcerto: porcentagemAcerto,
        dataConclusao: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Desafio verificado com sucesso!',
      resultado: {
        acertos: acertos,
        total: desafio.perguntas.length,
        porcentagem: Math.round(porcentagemAcerto * 100) / 100,
        pontuacaoGanha: pontuacaoGanha,
        pontuacaoTotal: usuarioAtualizado.pontuacao,
        desafiosCompletados: usuarioAtualizado.desafiosCompletados
      },
      usuario: {
        id: usuarioAtualizado.id,
        nome: usuarioAtualizado.nome,
        pontuacao: usuarioAtualizado.pontuacao,
        desafiosCompletados: usuarioAtualizado.desafiosCompletados
      }
    });

  } catch (error) {
    console.error('Erro ao verificar respostas:', error);
    res.status(500).json({ 
      error: 'Erro ao verificar respostas',
      message: 'Ocorreu um erro ao processar suas respostas'
    });
  }
});

// ========== VÍDEOS ========== //
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      orderBy: { materia: 'asc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Erro ao carregar vídeos:', error);
    res.status(500).json({ error: 'Erro ao carregar vídeos' });
  }
});

// ========== TRATAMENTO DE ERROS ========== //
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'production' ? 'Erro interno' : error.message
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// ========== INICIALIZAÇÃO ========== //
async function startServer() {
  try {
    // Testar conexão com banco
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conectado ao banco de dados');
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`✨ API Coliseum operacional!`);
    });
    
    server.keepAliveTimeout = 120000;
    server.headersTimeout = 120000;
    
    return server;
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  await prisma.$disconnect();
  console.log('✅ Conexão com banco fechada');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Servidor recebeu sinal de término...');
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar servidor
startServer();

export { app };
