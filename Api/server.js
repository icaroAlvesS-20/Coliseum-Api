import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÕES SEGURAS ========== //

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// ✅ CONFIGURAÇÃO CORS SEGURA
const allowedOrigins = [
  'https://coliseum-frontend.vercel.app',
  'https://coliseum-adm.vercel.app',
  'https://coliseum-7raywxzsu-icaroass-projects.vercel.app',
  'https://coliseum-of2dynr3p-icaroass-projects.vercel.app',
  'https://coliseum-6hm18oy24-icaroass-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

// Adicionar origens do ambiente se existirem
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
}

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sem origin em desenvolvimento
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Em produção, exigir origin
    if (!origin && process.env.NODE_ENV === 'production') {
      return callback(new Error('Not allowed by CORS - Origin required'));
    }
    
    // Verificar se a origin está na lista
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('🚫 CORS bloqueado para origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 horas
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ✅ MIDDLEWARE DE SEGURANÇA
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...allowedOrigins.filter(o => o.startsWith('http'))]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ✅ RATE LIMITING
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite por IP
  message: {
    error: 'Muitas requisições deste IP',
    message: 'Por favor, tente novamente após 15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

// Limite mais restrito para login
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 tentativas por hora
  message: {
    error: 'Muitas tentativas de login',
    message: 'Por favor, tente novamente mais tarde'
  }
});

app.use('/api/login', authLimiter);
app.use('/api/usuarios', authLimiter);

// ✅ MIDDLEWARE PARA PARSING JSON COM LIMITE
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      res.status(400).json({ error: 'JSON inválido' });
    }
  }
}));

// ✅ COMPRESSÃO PARA PERFORMANCE
import compression from 'compression';
app.use(compression());

// ✅ MIDDLEWARE DE LOG SEGURO
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  // Adicionar ID à requisição
  req.requestId = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log seguro (não mostra senhas)
    const safeBody = { ...req.body };
    if (safeBody.senha) safeBody.senha = '***';
    if (safeBody.password) safeBody.password = '***';
    
    console.log(`\n=== REQUISIÇÃO ${requestId} ===`);
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('📍 Origin:', req.headers.origin || 'N/A');
    console.log('👤 IP:', req.ip);
    console.log('⏱️  Duração:', duration + 'ms');
    console.log(`📊 Status: ${res.statusCode}`);
    console.log(`======================\n`);
  });
  
  next();
});

// ========== UTILITÁRIOS ========== //

const validateId = (id) => {
  if (!id) return null;
  const numId = parseInt(id, 10);
  return !isNaN(numId) && numId > 0 ? numId : null;
};

const sanitizeString = (str) => {
  if (!str) return '';
  return str.toString().trim();
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'coliseum-secret-key',
    { expiresIn: '7d' }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'coliseum-secret-key');
  } catch (error) {
    return null;
  }
};

const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const handleError = (res, error, message = 'Erro interno do servidor') => {
  console.error(`❌ ${message}:`, error);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (error.code === 'P2025') {
    return res.status(404).json({ 
      error: 'Registro não encontrado'
    });
  }
  
  if (error.code === 'P2002') {
    return res.status(409).json({ 
      error: 'Conflito de dados',
      details: isProduction ? undefined : 'Dados já existem no sistema'
    });
  }

  if (error.code === 'P1001') {
    return res.status(503).json({ 
      error: 'Serviço indisponível',
      message: 'Tente novamente mais tarde'
    });
  }
  
  res.status(500).json({ 
    error: message,
    details: isProduction ? undefined : error.message
  });
};

// Cache simples em memória
const cache = {
  ranking: { data: null, timestamp: null, ttl: 5 * 60 * 1000 }, // 5 minutos
  desafios: { data: null, timestamp: null, ttl: 10 * 60 * 1000 }, // 10 minutos
  usuarios: { data: null, timestamp: null, ttl: 2 * 60 * 1000 } // 2 minutos
};

// ========== MIDDLEWARE DE AUTENTICAÇÃO ========== //

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    // Rotas públicas que não precisam de autenticação
    const publicRoutes = [
      '/',
      '/api/health',
      '/api/login',
      '/api/desafios-ativos',
      '/api/desafios/:id/perguntas',
      '/api/ranking'
    ];
    
    // Verificar se é uma rota pública
    const isPublicRoute = publicRoutes.some(route => {
      if (route.includes(':')) {
        const pattern = route.replace(/:[^/]+/g, '[^/]+');
        return new RegExp(`^${pattern}$`).test(req.path);
      }
      return route === req.path;
    });
    
    if (isPublicRoute) {
      return next();
    }
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acesso necessário',
        message: 'Faça login para acessar este recurso'
      });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded || !decoded.userId) {
      return res.status(403).json({ 
        error: 'Token inválido ou expirado',
        message: 'Faça login novamente'
      });
    }
    
    const usuario = await prisma.usuario.findUnique({
      where: { 
        id: decoded.userId,
        status: 'ATIVO'
      }
    });
    
    if (!usuario) {
      return res.status(403).json({ 
        error: 'Usuário não encontrado ou inativo',
        message: 'Contate o administrador'
      });
    }
    
    // Remover senha do objeto usuário
    const { senha, ...usuarioSemSenha } = usuario;
    req.usuario = usuarioSemSenha;
    next();
    
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro na autenticação',
      message: 'Ocorreu um erro interno'
    });
  }
};

app.use(authenticateToken);

// ========== ROTAS BÁSICAS ========== //

app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Coliseum Backend - Online',
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      usuarios: '/api/usuarios',
      login: '/api/login',
      ranking: '/api/ranking',
      desafios: '/api/desafios',
      cursos: '/api/cursos',
      videos: '/api/videos'
    }
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await testDatabaseConnection();
    
    const [totalUsuarios, totalVideos, totalCursos, totalDesafios] = await Promise.all([
      prisma.usuario.count().catch(() => 0),
      prisma.video.count().catch(() => 0),
      prisma.curso.count().catch(() => 0),
      prisma.desafio.count().catch(() => 0)
    ]);

    res.json({ 
      status: 'online',
      database: dbStatus ? 'connected' : 'disconnected',
      stats: {
        usuarios: totalUsuarios,
        videos: totalVideos,
        cursos: totalCursos,
        desafios: totalDesafios
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: 'Service unavailable'
    });
  }
});

// ========== SISTEMA DE USUÁRIOS ========== //

// ✅ GET TODOS OS USUÁRIOS (COM PAGINAÇÃO)
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log('👥 Buscando usuários...');
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    
    const search = req.query.search ? sanitizeString(req.query.search) : '';
    const status = req.query.status ? sanitizeString(req.query.status) : undefined;
    
    const where = {};
    
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { ra: { contains: search, mode: 'insensitive' } },
        { serie: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status) {
      where.status = status;
    }
    
    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
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
        orderBy: { criadoEm: 'desc' },
        skip: skip,
        take: limit
      }),
      prisma.usuario.count({ where })
    ]);

    console.log(`✅ ${usuarios.length} usuários carregados (página ${page})`);
    
    res.json({
      success: true,
      data: usuarios,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar usuários');
  }
});

// ✅ GET USUÁRIO POR ID
app.get('/api/usuarios/:id', async (req, res) => {
  try {
    const userId = validateId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`👤 Buscando usuário ID: ${userId}`);
    
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        curso: true,
        pontuacao: true,
        desafiosCompletados: true,
        status: true,
        email: true,
        telefone: true,
        dataNascimento: true,
        avatarUrl: true,
        ultimoLogin: true,
        criadoEm: true,
        atualizadoEm: true
      }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      success: true,
      data: usuario
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar usuário');
  }
});

// ✅ POST CRIAR USUÁRIO
app.post('/api/usuarios', async (req, res) => {
  try {
    console.log('📝 Recebendo requisição POST /api/usuarios');
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        error: 'Body da requisição vazio ou inválido'
      });
    }

    const { 
      nome, 
      ra, 
      serie, 
      senha, 
      curso = 'matematica', 
      status = 'ATIVO',
      email,
      telefone,
      dataNascimento 
    } = req.body;

    // ✅ VALIDAÇÃO
    const missingFields = [];
    if (!nome || nome.trim() === '') missingFields.push('nome');
    if (!ra || ra.toString().trim() === '') missingFields.push('ra');
    if (!serie || serie.trim() === '') missingFields.push('serie');
    if (!senha || senha.trim() === '') missingFields.push('senha');

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Dados incompletos',
        missingFields: missingFields
      });
    }

    // ✅ SANITIZAÇÃO
    const nomeSanitizado = sanitizeString(nome);
    const raSanitizado = sanitizeString(ra);
    const serieSanitizada = sanitizeString(serie);
    const cursoSanitizado = sanitizeString(curso);

    // ✅ VALIDAÇÃO DO RA (4 dígitos)
    if (!/^\d{4}$/.test(raSanitizado)) {
      return res.status(400).json({
        error: 'RA inválido',
        details: 'O RA deve conter exatamente 4 dígitos numéricos'
      });
    }

    // ✅ VALIDAÇÃO DE SENHA
    if (senha.length < 6) {
      return res.status(400).json({
        error: 'Senha muito curta',
        details: 'A senha deve ter pelo menos 6 caracteres'
      });
    }

    // ✅ VALIDAÇÃO DE EMAIL
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        error: 'Email inválido',
        details: 'Forneça um email válido'
      });
    }

    // ✅ Verificar se RA já existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { ra: raSanitizado }
    });

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'RA já cadastrado',
        details: `O RA ${raSanitizado} já está em uso`
      });
    }

    // ✅ Hash da senha
    const senhaHash = await hashPassword(senha);

    // ✅ Criar novo usuário
    const novoUsuario = await prisma.usuario.create({
      data: {
        nome: nomeSanitizado,
        ra: raSanitizado,
        serie: serieSanitizada,
        senha: senhaHash,
        curso: cursoSanitizado,
        status: status,
        email: email ? sanitizeString(email) : null,
        telefone: telefone ? sanitizeString(telefone) : null,
        dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
        pontuacao: 0,
        desafiosCompletados: 0,
        criadoEm: new Date(),
        atualizadoEm: new Date()
      }
    });

    console.log('✅ Usuário criado com sucesso - ID:', novoUsuario.id);

    // ✅ Gerar token
    const token = generateToken(novoUsuario.id);

    // ✅ Retornar dados sem a senha
    const { senha: _, ...usuarioSemSenha } = novoUsuario;

    // Invalidar cache
    cache.usuarios.data = null;
    cache.ranking.data = null;

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso!',
      data: usuarioSemSenha,
      token
    });

  } catch (error) {
    handleError(res, error, 'Erro ao criar usuário');
  }
});

// ✅ LOGIN
app.post('/api/login', async (req, res) => {
  try {
    console.log('🔐 Recebendo requisição de login');

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Dados de login necessários'
      });
    }

    const { ra, senha } = req.body;

    if (!ra || !senha) {
      return res.status(400).json({
        success: false,
        error: 'RA e senha são obrigatórios'
      });
    }

    console.log('🔍 Buscando usuário com RA:', ra);

    // ✅ BUSCAR USUÁRIO
    const usuario = await prisma.usuario.findUnique({
      where: { 
        ra: ra.toString().trim() 
      }
    });

    if (!usuario) {
      console.log('❌ Usuário não encontrado para RA:', ra);
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    // ✅ VERIFICAR SE USUÁRIO ESTÁ ATIVO
    if (usuario.status !== 'ATIVO') {
      console.log('❌ Usuário inativo tentou fazer login:', usuario.nome);
      return res.status(403).json({
        success: false,
        error: 'Usuário inativo. Contate o administrador.'
      });
    }

    console.log('✅ Usuário encontrado:', usuario.nome);

    // ✅ VERIFICAR SENHA
    const senhaValida = await comparePassword(senha, usuario.senha);
    
    if (!senhaValida) {
      console.log('❌ Senha incorreta para usuário:', usuario.nome);
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }

    // ✅ ATUALIZAR ÚLTIMO LOGIN
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() }
    });

    console.log('✅ Login bem-sucedido para:', usuario.nome);

    // ✅ GERAR TOKEN
    const token = generateToken(usuario.id);

    // ✅ RETORNAR DADOS DO USUÁRIO
    const { senha: _, ...usuarioSemSenha } = usuario;

    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      data: usuarioSemSenha,
      token
    });

  } catch (error) {
    handleError(res, error, 'Erro no login');
  }
});

// ✅ RANKING
app.get('/api/ranking', async (req, res) => {
  try {
    const now = Date.now();
    
    // Verificar cache
    if (cache.ranking.data && cache.ranking.timestamp && 
        (now - cache.ranking.timestamp) < cache.ranking.ttl) {
      console.log('📊 Ranking servido do cache');
      return res.json({
        success: true,
        data: cache.ranking.data,
        cached: true,
        timestamp: new Date(cache.ranking.timestamp).toISOString()
      });
    }

    console.log('📊 Gerando novo ranking...');
    
    const usuarios = await prisma.usuario.findMany({
      where: {
        status: 'ATIVO'
      },
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        curso: true,
        pontuacao: true,
        desafiosCompletados: true,
        avatarUrl: true
      },
      orderBy: { pontuacao: 'desc' },
      take: 100
    });

    console.log(`📊 Ranking carregado: ${usuarios.length} usuários`);
    
    // Atualizar cache
    cache.ranking.data = usuarios;
    cache.ranking.timestamp = now;
    
    res.json({
      success: true,
      data: usuarios,
      cached: false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar ranking');
  }
});

// ✅ PUT ATUALIZAR USUÁRIO
app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const userId = validateId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const { 
      nome, 
      ra, 
      serie, 
      curso, 
      pontuacao, 
      desafiosCompletados, 
      status,
      email,
      telefone,
      dataNascimento,
      avatarUrl 
    } = req.body;
    
    console.log(`✏️ Atualizando usuário ID: ${userId}`);

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // ✅ VALIDAÇÃO: Verificar se novo RA já existe (se foi alterado)
    if (ra && ra !== usuarioExistente.ra) {
      const raSanitizado = sanitizeString(ra);
      
      if (!/^\d{4}$/.test(raSanitizado)) {
        return res.status(400).json({
          error: 'RA inválido',
          details: 'O RA deve conter exatamente 4 dígitos numéricos'
        });
      }
      
      const raExistente = await prisma.usuario.findUnique({
        where: { ra: raSanitizado }
      });
      
      if (raExistente && raExistente.id !== userId) {
        return res.status(409).json({
          error: 'RA já está em uso',
          details: `O RA ${raSanitizado} já pertence a outro usuário.`
        });
      }
    }

    const updateData = { 
      atualizadoEm: new Date()
    };

    if (nome !== undefined) updateData.nome = sanitizeString(nome);
    if (ra !== undefined) updateData.ra = sanitizeString(ra);
    if (serie !== undefined) updateData.serie = sanitizeString(serie);
    if (curso !== undefined) updateData.curso = sanitizeString(curso);
    if (pontuacao !== undefined) updateData.pontuacao = parseInt(pontuacao, 10);
    if (desafiosCompletados !== undefined) updateData.desafiosCompletados = parseInt(desafiosCompletados, 10);
    if (status !== undefined) updateData.status = status;
    if (email !== undefined) updateData.email = email ? sanitizeString(email) : null;
    if (telefone !== undefined) updateData.telefone = telefone ? sanitizeString(telefone) : null;
    if (dataNascimento !== undefined) updateData.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl ? sanitizeString(avatarUrl) : null;

    const usuarioAtualizado = await prisma.usuario.update({
      where: { id: userId },
      data: updateData
    });

    console.log(`✅ Usuário atualizado:`, usuarioAtualizado.nome);
    
    // Invalidar cache
    cache.usuarios.data = null;
    cache.ranking.data = null;
    
    // Retornar sem senha
    const { senha, ...usuarioSemSenha } = usuarioAtualizado;
    
    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!',
      data: usuarioSemSenha
    });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar usuário');
  }
});

// ✅ DELETE USUÁRIO
app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    const userId = validateId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`🗑️ Excluindo usuário ID: ${userId}`);

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Marcar como inativo em vez de excluir
    await prisma.usuario.update({
      where: { id: userId },
      data: {
        status: 'INATIVO',
        atualizadoEm: new Date()
      }
    });

    console.log(`✅ Usuário marcado como inativo: ${usuarioExistente.nome}`);
    
    // Invalidar cache
    cache.usuarios.data = null;
    cache.ranking.data = null;
    
    res.json({
      success: true,
      message: 'Usuário excluído com sucesso!',
      data: {
        id: usuarioExistente.id,
        nome: usuarioExistente.nome,
        ra: usuarioExistente.ra
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir usuário');
  }
});

// ========== SISTEMA DE DESAFIOS ========== //

// ✅ GET TODOS OS DESAFIOS (ADMIN)
app.get('/api/desafios', async (req, res) => {
  try {
    console.log('🎯 Buscando todos os desafios...');
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const status = req.query.status ? sanitizeString(req.query.status) : undefined;
    const materia = req.query.materia ? sanitizeString(req.query.materia) : undefined;
    const nivel = req.query.nivel ? sanitizeString(req.query.nivel) : undefined;
    
    const where = {};
    
    if (status) where.status = status;
    if (materia) where.materia = { contains: materia, mode: 'insensitive' };
    if (nivel) where.nivel = nivel;
    
    const [desafios, total] = await Promise.all([
      prisma.desafio.findMany({
        where,
        include: {
          perguntas: {
            where: { ativo: true },
            orderBy: { ordem: 'asc' },
            select: {
              id: true,
              pergunta: true,
              ordem: true,
              dificuldade: true
            }
          },
          _count: {
            select: {
              historico: true,
              perguntas: true
            }
          }
        },
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit
      }),
      prisma.desafio.count({ where })
    ]);

    console.log(`✅ ${desafios.length} desafios carregados`);
    
    res.json({
      success: true,
      data: desafios,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar desafios');
  }
});

// ✅ GET DESAFIO POR ID
app.get('/api/desafios/:id', async (req, res) => {
  try {
    const desafioId = validateId(req.params.id);
    if (!desafioId) {
      return res.status(400).json({ error: 'ID do desafio inválido' });
    }

    console.log(`🎯 Buscando desafio específico ID: ${desafioId}`);
    
    const desafio = await prisma.desafio.findUnique({
      where: { id: desafioId },
      include: {
        perguntas: {
          where: { ativo: true },
          orderBy: { ordem: 'asc' }
        },
        _count: {
          select: {
            historico: true
          }
        }
      }
    });

    if (!desafio) {
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }

    res.json({
      success: true,
      data: desafio
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar desafio');
  }
});

// ✅ POST CRIAR DESAFIO
app.post('/api/desafios', async (req, res) => {
  try {
    console.log('🎯 Recebendo requisição para criar desafio...');
    
    const { 
      titulo, 
      pontuacao, 
      materia, 
      nivel, 
      duracao, 
      descricao, 
      status = 'ATIVO', 
      maxTentativas = 1,
      dataInicio,
      dataFim,
      tags = [],
      perguntas 
    } = req.body;

    // ✅ VALIDAÇÃO DOS CAMPOS OBRIGATÓRIOS
    const requiredFields = ['titulo', 'pontuacao', 'materia', 'nivel', 'duracao'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        missingFields: missingFields,
        message: 'Campos obrigatórios faltando'
      });
    }

    // ✅ VALIDAÇÃO DAS PERGUNTAS
    if (!perguntas || !Array.isArray(perguntas) || perguntas.length < 3) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: 'O desafio deve ter pelo menos 3 perguntas'
      });
    }

    // ✅ VALIDAR CADA PERGUNTA
    for (let i = 0; i < perguntas.length; i++) {
      const pergunta = perguntas[i];
      
      if (!pergunta.pergunta || pergunta.pergunta.trim() === '') {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: `Pergunta ${i + 1} não tem texto`
        });
      }

      if (!pergunta.alternativas || !Array.isArray(pergunta.alternativas) || pergunta.alternativas.length < 4) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: `Pergunta ${i + 1} deve ter 4 alternativas`
        });
      }

      for (let j = 0; j < pergunta.alternativas.length; j++) {
        if (!pergunta.alternativas[j] || pergunta.alternativas[j].trim() === '') {
          return res.status(400).json({
            error: 'Dados inválidos',
            details: `Pergunta ${i + 1}, alternativa ${j + 1} está vazia`
          });
        }
      }

      if (pergunta.correta === undefined || pergunta.correta < 0 || pergunta.correta > 3) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: `Pergunta ${i + 1} não tem alternativa correta definida`
        });
      }
    }

    console.log('📝 Dados válidados, criando desafio...');

    // ✅ CRIAR DESAFIO E PERGUNTAS EM UMA TRANSAÇÃO
    const novoDesafio = await prisma.$transaction(async (tx) => {
      const desafio = await tx.desafio.create({
        data: {
          titulo: sanitizeString(titulo),
          pontuacao: parseInt(pontuacao, 10),
          materia: sanitizeString(materia),
          nivel: sanitizeString(nivel),
          duracao: parseInt(duracao, 10),
          descricao: descricao ? sanitizeString(descricao) : '',
          status: status,
          maxTentativas: parseInt(maxTentativas, 10),
          dataInicio: dataInicio ? new Date(dataInicio) : null,
          dataFim: dataFim ? new Date(dataFim) : null,
          tags: tags,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        }
      });

      console.log(`✅ Desafio criado com ID: ${desafio.id}`);

      for (let i = 0; i < perguntas.length; i++) {
        const perguntaData = perguntas[i];
        
        await tx.perguntaDesafio.create({
          data: {
            pergunta: sanitizeString(perguntaData.pergunta),
            alternativaA: sanitizeString(perguntaData.alternativas[0]),
            alternativaB: sanitizeString(perguntaData.alternativas[1]),
            alternativaC: sanitizeString(perguntaData.alternativas[2]),
            alternativaD: sanitizeString(perguntaData.alternativas[3]),
            correta: parseInt(perguntaData.correta, 10),
            explicacao: perguntaData.explicacao ? sanitizeString(perguntaData.explicacao) : null,
            ordem: perguntaData.ordem || i + 1,
            dificuldade: perguntaData.dificuldade || 1,
            desafioId: desafio.id,
            ativo: true
          }
        });
      }

      console.log(`✅ ${perguntas.length} perguntas criadas`);

      return await tx.desafio.findUnique({
        where: { id: desafio.id },
        include: {
          perguntas: {
            where: { ativo: true },
            orderBy: { ordem: 'asc' }
          }
        }
      });
    });

    console.log('🎉 Desafio criado com sucesso!');

    // Invalidar cache
    cache.desafios.data = null;

    res.status(201).json({
      success: true,
      message: 'Desafio criado com sucesso!',
      data: novoDesafio
    });

  } catch (error) {
    handleError(res, error, 'Erro ao criar desafio');
  }
});

// ✅ PUT ATUALIZAR DESAFIO
app.put('/api/desafios/:id', async (req, res) => {
  try {
    const desafioId = validateId(req.params.id);
    if (!desafioId) {
      return res.status(400).json({ error: 'ID do desafio inválido' });
    }

    console.log(`✏️ Atualizando desafio ID: ${desafioId}`);
    
    const { 
      titulo, 
      pontuacao, 
      materia, 
      nivel, 
      duracao, 
      descricao, 
      status, 
      maxTentativas,
      dataInicio,
      dataFim,
      tags,
      perguntas 
    } = req.body;

    const desafioExistente = await prisma.desafio.findUnique({
      where: { id: desafioId },
      include: { perguntas: true }
    });

    if (!desafioExistente) {
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }

    if (perguntas && Array.isArray(perguntas)) {
      if (perguntas.length < 3) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: 'O desafio deve ter pelo menos 3 perguntas'
        });
      }

      for (let i = 0; i < perguntas.length; i++) {
        const pergunta = perguntas[i];
        
        if (!pergunta.pergunta || pergunta.pergunta.trim() === '') {
          return res.status(400).json({
            error: 'Dados inválidos',
            details: `Pergunta ${i + 1} não tem texto`
          });
        }

        if (!pergunta.alternativas || !Array.isArray(pergunta.alternativas) || pergunta.alternativas.length < 4) {
          return res.status(400).json({
            error: 'Dados inválidos',
            details: `Pergunta ${i + 1} deve ter 4 alternativas`
          });
        }
      }
    }

    const desafioAtualizado = await prisma.$transaction(async (tx) => {
      const updateData = { 
        atualizadoEm: new Date()
      };

      if (titulo !== undefined) updateData.titulo = sanitizeString(titulo);
      if (pontuacao !== undefined) updateData.pontuacao = parseInt(pontuacao, 10);
      if (materia !== undefined) updateData.materia = sanitizeString(materia);
      if (nivel !== undefined) updateData.nivel = sanitizeString(nivel);
      if (duracao !== undefined) updateData.duracao = parseInt(duracao, 10);
      if (descricao !== undefined) updateData.descricao = sanitizeString(descricao);
      if (status !== undefined) updateData.status = status;
      if (maxTentativas !== undefined) updateData.maxTentativas = parseInt(maxTentativas, 10);
      if (dataInicio !== undefined) updateData.dataInicio = dataInicio ? new Date(dataInicio) : null;
      if (dataFim !== undefined) updateData.dataFim = dataFim ? new Date(dataFim) : null;
      if (tags !== undefined) updateData.tags = tags;

      const desafio = await tx.desafio.update({
        where: { id: desafioId },
        data: updateData
      });

      if (perguntas && Array.isArray(perguntas)) {
        // Marcar perguntas antigas como inativas
        await tx.perguntaDesafio.updateMany({
          where: { desafioId: desafioId },
          data: { ativo: false }
        });

        // Criar novas perguntas
        for (let i = 0; i < perguntas.length; i++) {
          const perguntaData = perguntas[i];
          
          await tx.perguntaDesafio.create({
            data: {
              pergunta: sanitizeString(perguntaData.pergunta),
              alternativaA: sanitizeString(perguntaData.alternativas[0]),
              alternativaB: sanitizeString(perguntaData.alternativas[1]),
              alternativaC: sanitizeString(perguntaData.alternativas[2]),
              alternativaD: sanitizeString(perguntaData.alternativas[3]),
              correta: parseInt(perguntaData.correta, 10),
              explicacao: perguntaData.explicacao ? sanitizeString(perguntaData.explicacao) : null,
              ordem: perguntaData.ordem || i + 1,
              dificuldade: perguntaData.dificuldade || 1,
              desafioId: desafio.id,
              ativo: true
            }
          });
        }

        console.log(`✅ ${perguntas.length} perguntas atualizadas`);
      }

      return await tx.desafio.findUnique({
        where: { id: desafioId },
        include: {
          perguntas: {
            where: { ativo: true },
            orderBy: { ordem: 'asc' }
          }
        }
      });
    });

    console.log(`✅ Desafio atualizado: ${desafioAtualizado.titulo}`);

    // Invalidar cache
    cache.desafios.data = null;

    res.json({
      success: true,
      message: 'Desafio atualizado com sucesso!',
      data: desafioAtualizado
    });

  } catch (error) {
    handleError(res, error, 'Erro ao atualizar desafio');
  }
});

// ✅ DELETE DESAFIO
app.delete('/api/desafios/:id', async (req, res) => {
  try {
    const desafioId = validateId(req.params.id);
    if (!desafioId) {
      return res.status(400).json({ error: 'ID do desafio inválido' });
    }

    console.log(`🗑️ Excluindo desafio ID: ${desafioId}`);

    const desafioExistente = await prisma.desafio.findUnique({
      where: { id: desafioId }
    });

    if (!desafioExistente) {
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }

    await prisma.desafio.update({
      where: { id: desafioId },
      data: {
        status: 'INATIVO',
        atualizadoEm: new Date()
      }
    });

    console.log(`✅ Desafio excluído logicamente: ${desafioExistente.titulo}`);

    // Invalidar cache
    cache.desafios.data = null;

    res.json({
      success: true,
      message: 'Desafio excluído com sucesso!',
      data: { id: desafioId }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao excluir desafio');
  }
});

// ✅ GET DESAFIOS ATIVOS PARA USUÁRIOS
app.get('/api/desafios-ativos', async (req, res) => {
  try {
    const now = Date.now();
    
    // Verificar cache
    if (cache.desafios.data && cache.desafios.timestamp && 
        (now - cache.desafios.timestamp) < cache.desafios.ttl) {
      console.log('🎯 Desafios ativos servidos do cache');
      return res.json({
        success: true,
        data: cache.desafios.data,
        cached: true,
        timestamp: new Date(cache.desafios.timestamp).toISOString()
      });
    }

    console.log('🎯 Buscando desafios ativos para usuários...');
    
    const agora = new Date();
    
    const desafios = await prisma.desafio.findMany({
      where: {
        AND: [
          { status: 'ATIVO' },
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
        tags: true,
        _count: {
          select: { perguntas: true }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    console.log(`✅ ${desafios.length} desafios ativos carregados`);
    
    // Atualizar cache
    cache.desafios.data = desafios;
    cache.desafios.timestamp = now;
    
    res.json({
      success: true,
      data: desafios,
      cached: false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar desafios ativos');
  }
});

// ✅ GET PERGUNTAS DE UM DESAFIO
app.get('/api/desafios/:id/perguntas', async (req, res) => {
  try {
    const desafioId = validateId(req.params.id);
    if (!desafioId) {
      return res.status(400).json({ error: 'ID do desafio inválido' });
    }

    console.log(`🎯 Buscando perguntas do desafio ID: ${desafioId}`);
    
    const desafio = await prisma.desafio.findUnique({
      where: { 
        id: desafioId,
        status: 'ATIVO'
      },
      select: {
        id: true,
        titulo: true,
        pontuacao: true,
        duracao: true,
        maxTentativas: true,
        materia: true,
        nivel: true,
        perguntas: {
          where: { ativo: true },
          select: {
            id: true,
            pergunta: true,
            alternativaA: true,
            alternativaB: true,
            alternativaC: true,
            alternativaD: true,
            ordem: true,
            explicacao: true
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

    // Embaralhar alternativas (mas manter ordem original das perguntas)
    const perguntasEmbaralhadas = desafio.perguntas.map(pergunta => {
      const alternativas = [
        { letra: 'A', texto: pergunta.alternativaA },
        { letra: 'B', texto: pergunta.alternativaB },
        { letra: 'C', texto: pergunta.alternativaC },
        { letra: 'D', texto: pergunta.alternativaD }
      ];
      
      // Criar cópia para embaralhar
      const alternativasEmbaralhadas = [...alternativas];
      for (let i = alternativasEmbaralhadas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [alternativasEmbaralhadas[i], alternativasEmbaralhadas[j]] = 
        [alternativasEmbaralhadas[j], alternativasEmbaralhadas[i]];
      }
      
      return {
        id: pergunta.id,
        pergunta: pergunta.pergunta,
        alternativas: alternativasEmbaralhadas,
        ordem: pergunta.ordem,
        explicacao: pergunta.explicacao
      };
    });

    res.json({
      success: true,
      data: {
        ...desafio,
        perguntas: perguntasEmbaralhadas
      }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao carregar perguntas do desafio');
  }
});

// ✅ POST VERIFICAR RESPOSTAS
app.post('/api/desafios/:id/verificar', async (req, res) => {
  try {
    const desafioId = validateId(req.params.id);
    if (!desafioId) {
      return res.status(400).json({ error: 'ID do desafio inválido' });
    }

    const { usuarioId, respostas } = req.body;

    if (!usuarioId || !respostas || !Array.isArray(respostas)) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        details: 'Forneça usuarioId e um array de respostas'
      });
    }

    const userId = validateId(usuarioId);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`📝 Verificando respostas do desafio ID: ${desafioId} para usuário: ${userId}`);

    const desafio = await prisma.desafio.findUnique({
      where: { 
        id: desafioId,
        status: 'ATIVO'
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
        status: 'ATIVO'
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

    if (desafio.dataInicio && new Date(desafio.dataInicio) > agora) {
      return res.status(400).json({ 
        error: 'Desafio não iniciado',
        details: 'Este desafio ainda não está disponível'
      });
    }

    // Verificar respostas
    let acertos = 0;
    const resultadoDetalhado = [];

    for (let i = 0; i < desafio.perguntas.length; i++) {
      const pergunta = desafio.perguntas[i];
      const respostaUsuario = respostas[i];
      
      // Validar resposta
      if (respostaUsuario === undefined || respostaUsuario === null) {
        resultadoDetalhado.push({
          perguntaId: pergunta.id,
          pergunta: pergunta.pergunta,
          respostaUsuario: null,
          correta: pergunta.correta,
          acertou: false,
          explicacao: pergunta.explicacao || 'Nenhuma resposta fornecida'
        });
        continue;
      }
      
      const correta = respostaUsuario === pergunta.correta;
      if (correta) acertos++;

      resultadoDetalhado.push({
        perguntaId: pergunta.id,
        pergunta: pergunta.pergunta,
        respostaUsuario: respostaUsuario,
        correta: pergunta.correta,
        acertou: correta,
        explicacao: pergunta.explicacao
      });
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

    // Bônus por velocidade (se tiver tempo)
    if (req.body.tempoUtilizado) {
      const tempoPorPergunta = req.body.tempoUtilizado / desafio.perguntas.length;
      if (tempoPorPergunta < 30) { // Menos de 30 segundos por pergunta
        pontuacaoGanha += Math.floor(pontuacaoGanha * 0.1);
      }
    }

    // Atualizar usuário em uma transação
    const resultado = await prisma.$transaction(async (tx) => {
      const usuarioAtualizado = await tx.usuario.update({
        where: { id: userId },
        data: {
          pontuacao: usuario.pontuacao + pontuacaoGanha,
          desafiosCompletados: usuario.desafiosCompletados + 1,
          atualizadoEm: new Date()
        }
      });

      await tx.historicoDesafio.create({
        data: {
          usuarioId: userId,
          desafioId: desafioId,
          pontuacaoGanha: pontuacaoGanha,
          acertos: acertos,
          totalPerguntas: desafio.perguntas.length,
          porcentagemAcerto: porcentagemAcerto,
          tempoUtilizado: req.body.tempoUtilizado || null,
          respostas: req.body.respostas || null,
          dataConclusao: new Date()
        }
      });

      return usuarioAtualizado;
    });

    console.log(`✅ Desafio verificado: ${usuario.nome} acertou ${acertos}/${desafio.perguntas.length} (+${pontuacaoGanha} pontos)`);

    // Invalidar cache do ranking
    cache.ranking.data = null;

    res.json({
      success: true,
      message: 'Desafio verificado com sucesso!',
      data: {
        resultado: {
          acertos: acertos,
          total: desafio.perguntas.length,
          porcentagem: Math.round(porcentagemAcerto * 100) / 100,
          pontuacaoGanha: pontuacaoGanha,
          pontuacaoTotal: resultado.pontuacao,
          desafiosCompletados: resultado.desafiosCompletados
        },
        detalhes: resultadoDetalhado,
        usuario: {
          id: resultado.id,
          nome: resultado.nome,
          pontuacao: resultado.pontuacao,
          desafiosCompletados: resultado.desafiosCompletados
        }
      }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao verificar respostas do desafio');
  }
});

// ✅ GET HISTÓRICO DE DESAFIOS DO USUÁRIO
app.get('/api/usuarios/:usuarioId/historico-desafios', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [historico, total] = await Promise.all([
      prisma.historicoDesafio.findMany({
        where: { usuarioId: usuarioId },
        include: {
          desafio: {
            select: {
              id: true,
              titulo: true,
              materia: true,
              nivel: true,
              pontuacao: true
            }
          }
        },
        orderBy: { dataConclusao: 'desc' },
        skip: skip,
        take: limit
      }),
      prisma.historicoDesafio.count({
        where: { usuarioId: usuarioId }
      })
    ]);

    res.json({
      success: true,
      data: historico,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar histórico de desafios');
  }
});

// ========== SISTEMA DE CURSOS ========== //

// ✅ GET TODOS OS CURSOS
app.get('/api/cursos', async (req, res) => {
  try {
    console.log('📚 Buscando todos os cursos...');
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const where = { ativo: true };
    
    if (req.query.materia) {
      where.materia = sanitizeString(req.query.materia);
    }
    
    if (req.query.nivel) {
      where.nivel = sanitizeString(req.query.nivel);
    }
    
    if (req.query.categoria) {
      where.categoria = sanitizeString(req.query.categoria);
    }

    const [cursos, total] = await Promise.all([
      prisma.curso.findMany({
        where,
        include: {
          modulos: {
            where: { ativo: true },
            include: {
              aulas: {
                where: { ativo: true },
                orderBy: { ordem: 'asc' },
                select: {
                  id: true,
                  titulo: true,
                  descricao: true,
                  duracao: true,
                  ordem: true
                }
              }
            },
            orderBy: { ordem: 'asc' }
          },
          _count: {
            select: {
              progressos: true
            }
          }
        },
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit
      }),
      prisma.curso.count({ where })
    ]);

    console.log(`✅ ${cursos.length} cursos carregados`);
    
    res.json({
      success: true,
      data: cursos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar cursos');
  }
});

// ✅ GET CURSO POR ID
app.get('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    console.log(`🎯 Buscando curso específico ID: ${cursoId}`);
    
    const curso = await prisma.curso.findUnique({
      where: { id: cursoId, ativo: true },
      include: {
        modulos: {
          where: { ativo: true },
          include: {
            aulas: {
              where: { ativo: true },
              orderBy: { ordem: 'asc' }
            }
          },
          orderBy: { ordem: 'asc' }
        },
        _count: {
          select: {
            progressos: true
          }
        }
      }
    });

    if (!curso) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    res.json({
      success: true,
      data: curso
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar curso');
  }
});

// ✅ POST CRIAR CURSO
app.post('/api/cursos', async (req, res) => {
  try {
    const { 
      titulo, 
      descricao, 
      materia, 
      categoria, 
      nivel, 
      duracao, 
      imagem, 
      ativo = true,
      preco,
      modulos 
    } = req.body;

    const requiredFields = ['titulo', 'materia', 'categoria', 'nivel', 'duracao'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        missingFields: missingFields
      });
    }

    const novoCurso = await prisma.$transaction(async (tx) => {
      const curso = await tx.curso.create({
        data: {
          titulo: sanitizeString(titulo),
          descricao: descricao ? sanitizeString(descricao) : '',
          materia: sanitizeString(materia),
          categoria: sanitizeString(categoria),
          nivel: sanitizeString(nivel),
          duracao: parseInt(duracao, 10),
          imagem: imagem ? sanitizeString(imagem) : null,
          ativo: ativo,
          preco: preco ? parseFloat(preco) : null,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        }
      });

      if (modulos && Array.isArray(modulos)) {
        let totalAulas = 0;
        
        for (const moduloData of modulos) {
          if (!moduloData.titulo) continue;
          
          const modulo = await tx.modulo.create({
            data: {
              titulo: sanitizeString(moduloData.titulo),
              descricao: moduloData.descricao ? sanitizeString(moduloData.descricao) : '',
              ordem: moduloData.ordem || 1,
              cursoId: curso.id,
              ativo: true,
              criadoEm: new Date(),
              atualizadoEm: new Date()
            }
          });

          if (moduloData.aulas && Array.isArray(moduloData.aulas)) {
            for (const aulaData of moduloData.aulas) {
              if (!aulaData.titulo) continue;
              
              await tx.aula.create({
                data: {
                  titulo: sanitizeString(aulaData.titulo),
                  descricao: aulaData.descricao ? sanitizeString(aulaData.descricao) : '',
                  conteudo: aulaData.conteudo ? sanitizeString(aulaData.conteudo) : '',
                  videoUrl: aulaData.videoUrl ? sanitizeString(aulaData.videoUrl) : null,
                  duracao: parseInt(aulaData.duracao || 15, 10),
                  ordem: aulaData.ordem || 1,
                  tipo: aulaData.tipo || 'video',
                  recursos: aulaData.recursos || [],
                  moduloId: modulo.id,
                  ativo: true,
                  criadoEm: new Date(),
                  atualizadoEm: new Date()
                }
              });
              
              totalAulas++;
            }
          }
        }
        
        // Atualizar total de aulas
        await tx.curso.update({
          where: { id: curso.id },
          data: { totalAulas }
        });
      }

      return await tx.curso.findUnique({
        where: { id: curso.id },
        include: {
          modulos: {
            include: { 
              aulas: true 
            }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      message: 'Curso criado com sucesso!',
      data: novoCurso
    });
  } catch (error) {
    handleError(res, error, 'Erro ao criar curso');
  }
});

// ✅ PUT ATUALIZAR CURSO
app.put('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) return res.status(400).json({ error: 'ID do curso inválido' });

    const { 
      titulo, 
      descricao, 
      materia, 
      categoria, 
      nivel, 
      duracao, 
      imagem, 
      ativo,
      preco,
      rating 
    } = req.body;
    
    const cursoExistente = await prisma.curso.findUnique({ 
      where: { id: cursoId } 
    });
    
    if (!cursoExistente) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    const updateData = { 
      atualizadoEm: new Date()
    };
    
    if (titulo !== undefined) updateData.titulo = sanitizeString(titulo);
    if (descricao !== undefined) updateData.descricao = sanitizeString(descricao);
    if (materia !== undefined) updateData.materia = sanitizeString(materia);
    if (categoria !== undefined) updateData.categoria = sanitizeString(categoria);
    if (nivel !== undefined) updateData.nivel = sanitizeString(nivel);
    if (duracao !== undefined) updateData.duracao = parseInt(duracao, 10);
    if (imagem !== undefined) updateData.imagem = imagem ? sanitizeString(imagem) : null;
    if (ativo !== undefined) updateData.ativo = ativo;
    if (preco !== undefined) updateData.preco = preco ? parseFloat(preco) : null;
    if (rating !== undefined) updateData.rating = parseFloat(rating);

    const cursoAtualizado = await prisma.curso.update({
      where: { id: cursoId },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Curso atualizado com sucesso!',
      data: cursoAtualizado
    });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar curso');
  }
});

// ✅ DELETE CURSO
app.delete('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) return res.status(400).json({ error: 'ID do curso inválido' });

    const cursoExistente = await prisma.curso.findUnique({ 
      where: { id: cursoId } 
    });
    
    if (!cursoExistente) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    await prisma.curso.update({
      where: { id: cursoId },
      data: { 
        ativo: false, 
        atualizadoEm: new Date() 
      }
    });

    res.json({
      success: true,
      message: 'Curso excluído com sucesso!',
      data: { id: cursoId }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir curso');
  }
});

// ========== SISTEMA DE VÍDEOS ========== //

// ✅ GET TODOS OS VÍDEOS
app.get('/api/videos', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const where = { ativo: true };
    
    if (req.query.materia) {
      where.materia = sanitizeString(req.query.materia);
    }
    
    if (req.query.categoria) {
      where.categoria = sanitizeString(req.query.categoria);
    }
    
    if (req.query.search) {
      where.titulo = {
        contains: sanitizeString(req.query.search),
        mode: 'insensitive'
      };
    }

    const [videos, total] = await Promise.all([
      prisma.video.findMany({ 
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit
      }),
      prisma.video.count({ where })
    ]);
    
    res.json({
      success: true,
      data: videos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar vídeos');
  }
});

// ✅ GET VÍDEO POR ID
app.get('/api/videos/:id', async (req, res) => {
  try {
    const videoId = validateId(req.params.id);
    if (!videoId) {
      return res.status(400).json({ error: 'ID do vídeo inválido' });
    }

    const video = await prisma.video.findUnique({ 
      where: { id: videoId } 
    });
    
    if (!video) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    // Incrementar views
    await prisma.video.update({
      where: { id: videoId },
      data: { views: { increment: 1 } }
    });

    res.json({
      success: true,
      data: video
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar vídeo');
  }
});

// ✅ POST CRIAR VÍDEO
app.post('/api/videos', async (req, res) => {
  try {
    const { titulo, materia, categoria, url, descricao, duracao } = req.body;

    const requiredFields = ['titulo', 'materia', 'categoria', 'url', 'duracao'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        missingFields: missingFields
      });
    }

    const novoVideo = await prisma.video.create({
      data: {
        titulo: sanitizeString(titulo),
        materia: sanitizeString(materia),
        categoria: sanitizeString(categoria),
        url: sanitizeString(url),
        descricao: descricao ? sanitizeString(descricao) : '',
        duracao: parseInt(duracao, 10),
        criadoEm: new Date(),
        atualizadoEm: new Date()
      }
    });

    res.status(201).json({
      success: true,
      message: 'Vídeo adicionado com sucesso!',
      data: novoVideo
    });
  } catch (error) {
    handleError(res, error, 'Erro ao criar vídeo');
  }
});

// ✅ PUT ATUALIZAR VÍDEO
app.put('/api/videos/:id', async (req, res) => {
  try {
    const videoId = validateId(req.params.id);
    if (!videoId) return res.status(400).json({ error: 'ID do vídeo inválido' });

    const videoExistente = await prisma.video.findUnique({ 
      where: { id: videoId } 
    });
    
    if (!videoExistente) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    const { titulo, materia, categoria, url, descricao, duracao } = req.body;
    const updateData = { 
      atualizadoEm: new Date()
    };
    
    if (titulo !== undefined) updateData.titulo = sanitizeString(titulo);
    if (materia !== undefined) updateData.materia = sanitizeString(materia);
    if (categoria !== undefined) updateData.categoria = sanitizeString(categoria);
    if (url !== undefined) updateData.url = sanitizeString(url);
    if (descricao !== undefined) updateData.descricao = sanitizeString(descricao);
    if (duracao !== undefined) updateData.duracao = parseInt(duracao, 10);

    const videoAtualizado = await prisma.video.update({
      where: { id: videoId },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Vídeo atualizado com sucesso!',
      data: videoAtualizado
    });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar vídeo');
  }
});

// ✅ DELETE VÍDEO
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const videoId = validateId(req.params.id);
    if (!videoId) return res.status(400).json({ error: 'ID do vídeo inválido' });

    const videoExistente = await prisma.video.findUnique({ 
      where: { id: videoId } 
    });
    
    if (!videoExistente) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    await prisma.video.delete({ 
      where: { id: videoId } 
    });

    res.json({
      success: true,
      message: 'Vídeo excluído com sucesso!',
      data: { id: videoId }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir vídeo');
  }
});

// ========== PROGRESSO DE CURSOS ========== //

// ✅ GET PROGRESSO DO USUÁRIO EM UM CURSO
app.get('/api/usuarios/:usuarioId/cursos/:cursoId/progresso', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    const cursoId = validateId(req.params.cursoId);
    
    if (!usuarioId || !cursoId) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }

    const progresso = await prisma.progressoCurso.findUnique({
      where: {
        usuarioId_cursoId: {
          usuarioId,
          cursoId
        }
      },
      include: {
        curso: {
          select: {
            id: true,
            titulo: true,
            totalAulas: true
          }
        }
      }
    });

    if (!progresso) {
      // Se não existe progresso, criar um novo
      const novoProgresso = await prisma.progressoCurso.create({
        data: {
          usuarioId,
          cursoId,
          progresso: 0,
          concluido: false,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        },
        include: {
          curso: {
            select: {
              id: true,
              titulo: true,
              totalAulas: true
            }
          }
        }
      });
      
      return res.json({
        success: true,
        data: novoProgresso
      });
    }

    res.json({
      success: true,
      data: progresso
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar progresso');
  }
});

// ✅ ATUALIZAR PROGRESSO DE AULA
app.post('/api/aulas/:aulaId/concluir', async (req, res) => {
  try {
    const aulaId = validateId(req.params.aulaId);
    const usuarioId = req.usuario?.id;
    
    if (!aulaId || !usuarioId) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    // Buscar aula e curso
    const aula = await prisma.aula.findUnique({
      where: { id: aulaId },
      include: {
        modulo: {
          include: {
            curso: true
          }
        }
      }
    });

    if (!aula) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    const cursoId = aula.modulo.curso.id;

    // Verificar ou criar progresso da aula
    let progressoAula = await prisma.progressoAula.findUnique({
      where: {
        usuarioId_aulaId: {
          usuarioId,
          aulaId
        }
      }
    });

    if (!progressoAula) {
      progressoAula = await prisma.progressoAula.create({
        data: {
          usuarioId,
          aulaId,
          cursoId,
          concluida: true,
          dataConclusao: new Date(),
          tempoAssistido: req.body.tempoAssistido || null,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        }
      });
    } else if (!progressoAula.concluida) {
      progressoAula = await prisma.progressoAula.update({
        where: { id: progressoAula.id },
        data: {
          concluida: true,
          dataConclusao: new Date(),
          tempoAssistido: req.body.tempoAssistido || progressoAula.tempoAssistido,
          atualizadoEm: new Date()
        }
      });
    }

    // Calcular progresso geral do curso
    const totalAulasCurso = aula.modulo.curso.totalAulas;
    const aulasConcluidas = await prisma.progressoAula.count({
      where: {
        usuarioId,
        cursoId,
        concluida: true
      }
    });

    const progressoPercentual = totalAulasCurso > 0 
      ? (aulasConcluidas / totalAulasCurso) * 100 
      : 0;

    const concluido = progressoPercentual >= 100;

    // Atualizar progresso do curso
    const progressoCurso = await prisma.progressoCurso.upsert({
      where: {
        usuarioId_cursoId: {
          usuarioId,
          cursoId
        }
      },
      update: {
        progresso: progressoPercentual,
        concluido,
        ultimaAula: aulaId,
        dataConclusao: concluido ? new Date() : null,
        atualizadoEm: new Date()
      },
      create: {
        usuarioId,
        cursoId,
        progresso: progressoPercentual,
        concluido,
        ultimaAula: aulaId,
        dataConclusao: concluido ? new Date() : null,
        criadoEm: new Date(),
        atualizadoEm: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Aula concluída com sucesso!',
      data: {
        aula: progressoAula,
        curso: progressoCurso,
        progresso: {
          aulasConcluidas,
          totalAulas: totalAulasCurso,
          percentual: progressoPercentual,
          concluido
        }
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao concluir aula');
  }
});

// ========== ROTAS DE ESTATÍSTICAS ========== //

// ✅ ESTATÍSTICAS GERAIS
app.get('/api/stats', async (req, res) => {
  try {
    const [
      totalUsuarios,
      totalUsuariosAtivos,
      totalDesafios,
      totalDesafiosAtivos,
      totalCursos,
      totalCursosAtivos,
      totalVideos,
      pontuacaoTotal,
      desafiosCompletadosTotal,
      rankingTop5
    ] = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.count({ where: { status: 'ATIVO' } }),
      prisma.desafio.count(),
      prisma.desafio.count({ where: { status: 'ATIVO' } }),
      prisma.curso.count(),
      prisma.curso.count({ where: { ativo: true } }),
      prisma.video.count(),
      prisma.usuario.aggregate({
        _sum: { pontuacao: true }
      }),
      prisma.usuario.aggregate({
        _sum: { desafiosCompletados: true }
      }),
      prisma.usuario.findMany({
        where: { status: 'ATIVO' },
        select: {
          id: true,
          nome: true,
          pontuacao: true,
          desafiosCompletados: true
        },
        orderBy: { pontuacao: 'desc' },
        take: 5
      })
    ]);

    res.json({
      success: true,
      data: {
        usuarios: {
          total: totalUsuarios,
          ativos: totalUsuariosAtivos,
          inativos: totalUsuarios - totalUsuariosAtivos
        },
        desafios: {
          total: totalDesafios,
          ativos: totalDesafiosAtivos
        },
        cursos: {
          total: totalCursos,
          ativos: totalCursosAtivos
        },
        videos: {
          total: totalVideos
        },
        pontuacao: {
          total: pontuacaoTotal._sum.pontuacao || 0,
          desafiosCompletados: desafiosCompletadosTotal._sum.desafiosCompletados || 0
        },
        rankingTop5
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar estatísticas');
  }
});

// ✅ ESTATÍSTICAS DO USUÁRIO
app.get('/api/usuarios/:id/stats', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.id);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        pontuacao: true,
        desafiosCompletados: true,
        criadoEm: true
      }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const [
      historicoDesafios,
      progressoCursos,
      posicaoRanking
    ] = await Promise.all([
      prisma.historicoDesafio.findMany({
        where: { usuarioId },
        include: {
          desafio: {
            select: {
              titulo: true,
              materia: true
            }
          }
        },
        orderBy: { dataConclusao: 'desc' },
        take: 10
      }),
      prisma.progressoCurso.findMany({
        where: { usuarioId },
        include: {
          curso: {
            select: {
              titulo: true,
              materia: true
            }
          }
        },
        orderBy: { atualizadoEm: 'desc' }
      }),
      prisma.$queryRaw`
        SELECT position FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY pontuacao DESC) as position
          FROM "Usuario" 
          WHERE status = 'ATIVO'
        ) ranked WHERE id = ${usuarioId}
      `
    ]);

    const posicao = posicaoRanking[0]?.position || 0;

    res.json({
      success: true,
      data: {
        usuario,
        posicaoRanking: posicao,
        historicoDesafios: {
          total: historicoDesafios.length,
          recentes: historicoDesafios
        },
        progressoCursos: {
          total: progressoCursos.length,
          concluidos: progressoCursos.filter(p => p.concluido).length,
          emAndamento: progressoCursos.filter(p => !p.concluido).length,
          cursos: progressoCursos
        }
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar estatísticas do usuário');
  }
});

// ========== ROTAS DE ADMIN ========== //

// Middleware para verificar admin
const isAdmin = (req, res, next) => {
  // Verificar se o usuário é admin
  // Implementar lógica real de verificação de admin
  const adminToken = req.headers['x-admin-token'];
  
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({
      error: 'Acesso não autorizado',
      message: 'Credenciais de administrador necessárias'
    });
  }
  
  next();
};

// ✅ RESETAR PONTUAÇÕES (ADMIN)
app.post('/api/admin/reset-pontuacoes', isAdmin, async (req, res) => {
  try {
    console.log('🔄 Resetando pontuações de todos os usuários...');
    
    await prisma.usuario.updateMany({
      data: {
        pontuacao: 0,
        desafiosCompletados: 0,
        atualizadoEm: new Date()
      }
    });
    
    // Invalidar cache
    cache.ranking.data = null;
    cache.usuarios.data = null;
    
    console.log('✅ Pontuações resetadas com sucesso');
    
    res.json({
      success: true,
      message: 'Pontuações resetadas com sucesso!'
    });
  } catch (error) {
    handleError(res, error, 'Erro ao resetar pontuações');
  }
});

// ✅ BACKUP DE DADOS (SIMPLIFICADO)
app.get('/api/admin/backup', isAdmin, async (req, res) => {
  try {
    console.log('💾 Gerando backup de dados...');
    
    const [
      usuarios,
      desafios,
      cursos,
      videos
    ] = await Promise.all([
      prisma.usuario.findMany({
        select: {
          id: true,
          nome: true,
          ra: true,
          serie: true,
          curso: true,
          pontuacao: true,
          desafiosCompletados: true,
          status: true,
          criadoEm: true
        }
      }),
      prisma.desafio.findMany({
        include: {
          perguntas: {
            where: { ativo: true }
          }
        }
      }),
      prisma.curso.findMany({
        include: {
          modulos: {
            include: {
              aulas: true
            }
          }
        }
      }),
      prisma.video.findMany()
    ]);
    
    const backup = {
      timestamp: new Date().toISOString(),
      data: {
        usuarios,
        desafios,
        cursos,
        videos
      }
    };
    
    console.log(`✅ Backup gerado: ${usuarios.length} usuários, ${desafios.length} desafios, ${cursos.length} cursos, ${videos.length} vídeos`);
    
    res.json({
      success: true,
      data: backup
    });
  } catch (error) {
    handleError(res, error, 'Erro ao gerar backup');
  }
});

// ========== CONEXÃO COM BANCO ========== //

async function testDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexão com banco de dados estabelecida');
    return true;
  } catch (error) {
    console.error('❌ Erro na conexão com banco:', error.message);
    return false;
  }
}

// ========== MANUSEIO DE ERROS GLOBAL ========== //

app.use((error, req, res, next) => {
  console.error('❌ Erro global não tratado:', error);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'JSON inválido',
      message: 'O corpo da requisição contém JSON malformado'
    });
  }
  
  if (error.name === 'RateLimitError') {
    return res.status(429).json({
      error: 'Muitas requisições',
      message: 'Por favor, tente novamente mais tarde'
    });
  }
  
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

// ========== INICIALIZAÇÃO DO SERVIDOR ========== //

async function initializeDatabase() {
  let retries = 5;
  let delay = 5000;
  
  while (retries > 0) {
    try {
      console.log(`🔄 Tentando conectar ao banco de dados... (${retries} tentativas restantes)`);
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Conectado ao banco de dados com sucesso!');
      return true;
      
    } catch (error) {
      console.error(`❌ Falha na conexão com o banco:`, error.message);
      retries -= 1;
      
      if (retries === 0) {
        console.error('❌ Todas as tentativas de conexão falharam');
        return false;
      }
      
      console.log(`⏳ Aguardando ${delay/1000} segundos antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 30000); // Backoff exponencial, máximo 30 segundos
    }
  }
}

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor Coliseum API...');
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
      console.error('❌ Não foi possível conectar ao banco de dados. Encerrando...');
      process.exit(1);
    }
    
    // Configurar timeout do servidor
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n📍 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 URL Local: http://localhost:${PORT}`);
      console.log(`🌐 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`📚 Documentação: http://localhost:${PORT}/`);
      console.log(`\n✨ API Coliseum totalmente operacional!`);
      
      // Registrar rotas disponíveis
      const routes = [];
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          routes.push({
            path: middleware.route.path,
            methods: Object.keys(middleware.route.methods)
          });
        }
      });
      
      console.log('\n📋 Rotas disponíveis:');
      routes.forEach(route => {
        console.log(`  ${route.methods.join(', ').padEnd(10)} ${route.path}`);
      });
    });
    
    // Configurar timeouts
    server.keepAliveTimeout = 120000; // 2 minutos
    server.headersTimeout = 120000; // 2 minutos
    
    // Middleware para detectar conexões lentas
    server.on('connection', (socket) => {
      socket.setTimeout(300000); // 5 minutos
    });
    
    return server;
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando servidor graciosamente...');
  await prisma.$disconnect();
  console.log('✅ Conexão com banco de dados fechada');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Servidor recebeu sinal de término...');
  await prisma.$disconnect();
  process.exit(0);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
});

// Iniciar servidor
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app }; // Para testes
