import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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
  'http://localhost:3000',
  'http://localhost:5173'
];

// Adicionar origens do ambiente se existirem
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
}

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sem origin (mobile apps, curl, etc)
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Em produção, exigir origin
    if (!origin && process.env.NODE_ENV === 'production') {
      return callback(new Error('Not allowed by CORS - Origin required'));
    }
    
    // Verificar se a origin está na lista
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('🚫 CORS bloqueado para origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
      connectSrc: ["'self'", process.env.ALLOWED_ORIGINS || '']
    }
  },
  crossOriginResourcePolicy: { policy: "same-site" }
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
  max: 5, // 5 tentativas por hora
  message: {
    error: 'Muitas tentativas de login',
    message: 'Por favor, tente novamente mais tarde'
  }
});

app.use('/api/login', authLimiter);

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

// ✅ MIDDLEWARE DE LOG SEGURO
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log seguro (não mostra senhas)
    const safeBody = { ...req.body };
    if (safeBody.senha) safeBody.senha = '***';
    if (safeBody.password) safeBody.password = '***';
    
    console.log(`\n=== REQUISIÇÃO ===`);
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('📍 Origin:', req.headers.origin);
    console.log('👤 IP:', req.ip);
    console.log('⏱️  Duração:', duration + 'ms');
    console.log(`📊 Status: ${res.statusCode}`);
    console.log('📦 Body:', Object.keys(safeBody));
    console.log(`==================\n`);
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
  return str.toString().trim().replace(/[<>]/g, '');
};

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const handleError = (res, error, message = 'Erro interno do servidor') => {
  console.error(`❌ ${message}:`, error);
  
  // Não expor detalhes internos em produção
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (error.code === 'P2025') {
    return res.status(404).json({ 
      error: 'Registro não encontrado',
      details: isProduction ? undefined : 'O item solicitado não existe ou já foi removido'
    });
  }
  
  if (error.code === 'P2002') {
    return res.status(409).json({ 
      error: 'Conflito de dados',
      details: isProduction ? undefined : 'Já existe um registro com esses dados únicos'
    });
  }

  if (error.code === 'P1001') {
    return res.status(503).json({ 
      error: 'Serviço indisponível',
      details: isProduction ? undefined : 'Não foi possível conectar ao banco de dados'
    });
  }
  
  res.status(500).json({ 
    error: message,
    details: isProduction ? undefined : error.message
  });
};

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

// ========== MIDDLEWARE DE AUTENTICAÇÃO ========== //

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    // Verificar se é uma rota que precisa de autenticação
    const publicRoutes = ['/api/login', '/api/health', '/', '/api/desafios-ativos'];
    
    if (publicRoutes.includes(req.path)) {
      return next();
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }
    
    // Implementação básica - você deve usar JWT ou similar
    const usuarioId = validateId(token); // Token simples por enquanto
    
    if (!usuarioId) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId, status: 'ativo' }
    });
    
    if (!usuario) {
      return res.status(403).json({ error: 'Usuário não encontrado ou inativo' });
    }
    
    req.usuario = usuario;
    next();
    
  } catch (error) {
    return res.status(500).json({ error: 'Erro na autenticação' });
  }
};

app.use(authenticateToken);

// ========== ROTAS BÁSICAS ========== //

app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Coliseum Backend - Online',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
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
      totalUsuarios,
      totalVideos,
      totalCursos,
      totalDesafios,
      uptime: process.uptime(),
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
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const [usuarios, total] = await Promise.all([
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
          criadoEm: true,
          atualizadoEm: true
        },
        orderBy: { criadoEm: 'desc' },
        skip: skip,
        take: limit
      }),
      prisma.usuario.count()
    ]);

    console.log(`✅ ${usuarios.length} usuários carregados (página ${page})`);
    
    res.json({
      usuarios,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar usuários');
  }
});

// ✅ POST CRIAR USUÁRIO COM VALIDAÇÃO ROBUSTA
app.post('/api/usuarios', async (req, res) => {
    try {
        console.log('📝 Recebendo requisição POST /api/usuarios');
        
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                error: 'Body da requisição vazio ou inválido'
            });
        }

        const { nome, ra, serie, senha, curso, status = 'ativo' } = req.body;

        // ✅ VALIDAÇÃO COMPLETA
        const missingFields = [];
        if (!nome || nome.trim() === '') missingFields.push('nome');
        if (!ra || ra.toString().trim() === '') missingFields.push('ra');
        if (!serie || serie.trim() === '') missingFields.push('serie');
        if (!senha || senha.trim() === '') missingFields.push('senha');
        if (!curso || curso.trim() === '') missingFields.push('curso');

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

        // ✅ Verificar se RA já existe
        const usuarioExistente = await prisma.usuario.findUnique({
            where: { ra: raSanitizado }
        });

        if (usuarioExistente) {
            return res.status(409).json({
                error: 'RA já cadastrado no sistema',
                details: `O RA ${raSanitizado} já está em uso por outro usuário.`
            });
        }

        // ✅ Criar novo usuário
        const novoUsuario = await prisma.usuario.create({
            data: {
                nome: nomeSanitizado,
                ra: raSanitizado,
                serie: serieSanitizada,
                senha: senha, // Em produção, usar bcrypt para hash
                curso: cursoSanitizado,
                status: status,
                pontuacao: 0,
                desafiosCompletados: 0,
                criadoEm: new Date(),
                atualizadoEm: new Date()
            }
        });

        console.log('✅ Usuário criado com sucesso - ID:', novoUsuario.id);

        // ✅ Retornar dados sem a senha
        const { senha: _, ...usuarioSemSenha } = novoUsuario;

        res.status(201).json({
            success: true,
            message: 'Usuário cadastrado com sucesso!',
            usuario: usuarioSemSenha,
            token: novoUsuario.id.toString() // Token simples
        });

    } catch (error) {
        handleError(res, error, 'Erro ao criar usuário');
    }
});

// ✅ LOGIN COM VALIDAÇÃO
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
            },
            select: {
                id: true,
                nome: true,
                ra: true,
                serie: true,
                curso: true,
                senha: true,
                status: true,
                pontuacao: true,
                desafiosCompletados: true,
                criadoEm: true
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
        if (usuario.status !== 'ativo') {
            console.log('❌ Usuário inativo tentou fazer login:', usuario.nome);
            return res.status(403).json({
                success: false,
                error: 'Usuário inativo. Contate o administrador.'
            });
        }

        console.log('✅ Usuário encontrado:', usuario.nome);

        // ✅ VERIFICAR SENHA (EM PRODUÇÃO USAR BCRYPT)
        if (usuario.senha !== senha.trim()) {
            console.log('❌ Senha incorreta para usuário:', usuario.nome);
            
            // Registrar tentativa falha
            console.log(`⚠️ Tentativa de login falha para RA: ${ra}`);
            
            return res.status(401).json({
                success: false,
                error: 'Senha incorreta'
            });
        }

        console.log('✅ Login bem-sucedido para:', usuario.nome);

        // ✅ RETORNAR DADOS DO USUÁRIO (sem a senha)
        const { senha: _, ...usuarioSemSenha } = usuario;

        // ✅ GERAR TOKEN (simples por enquanto)
        const token = usuario.id.toString();

        res.json({
            success: true,
            message: 'Login realizado com sucesso!',
            usuario: usuarioSemSenha,
            token: token
        });

    } catch (error) {
        handleError(res, error, 'Erro no login');
    }
});

// ✅ RANKING COM CACHE
const rankingCache = {
    data: null,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutos
};

app.get('/api/ranking', async (req, res) => {
    try {
        // Verificar cache
        const now = Date.now();
        if (rankingCache.data && rankingCache.timestamp && 
            (now - rankingCache.timestamp) < rankingCache.ttl) {
            console.log('📊 Ranking servido do cache');
            return res.json(rankingCache.data);
        }

        console.log('📊 Gerando novo ranking...');
        
        const usuarios = await prisma.usuario.findMany({
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
                desafiosCompletados: true,
            },
            orderBy: { pontuacao: 'desc' },
            take: 100
        });

        console.log(`📊 Ranking carregado: ${usuarios.length} usuários`);
        
        // Atualizar cache
        rankingCache.data = usuarios;
        rankingCache.timestamp = now;
        
        res.json(usuarios);
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

        const { nome, ra, serie, curso, pontuacao, desafiosCompletados, status } = req.body;
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
            
            if (raExistente) {
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

        const usuarioAtualizado = await prisma.usuario.update({
            where: { id: userId },
            data: updateData
        });

        console.log(`✅ Usuário atualizado:`, usuarioAtualizado.nome);
        
        // Invalidar cache do ranking
        rankingCache.data = null;
        
        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso!',
            usuario: usuarioAtualizado
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
                status: 'inativo',
                atualizadoEm: new Date()
            }
        });

        console.log(`✅ Usuário marcado como inativo: ${usuarioExistente.nome}`);
        
        // Invalidar cache do ranking
        rankingCache.data = null;
        
        res.json({
            success: true,
            message: 'Usuário excluído com sucesso!',
            usuarioExcluido: {
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

// ✅ GET DESAFIOS ATIVOS PARA USUÁRIOS COM CACHE
const desafiosCache = {
    data: null,
    timestamp: null,
    ttl: 10 * 60 * 1000 // 10 minutos
};

app.get('/api/desafios-ativos', async (req, res) => {
    try {
        // Verificar cache
        const now = Date.now();
        if (desafiosCache.data && desafiosCache.timestamp && 
            (now - desafiosCache.timestamp) < desafiosCache.ttl) {
            console.log('🎯 Desafios ativos servidos do cache');
            return res.json(desafiosCache.data);
        }

        console.log('🎯 Buscando desafios ativos para usuários...');
        
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

        console.log(`✅ ${desafios.length} desafios ativos carregados`);
        
        // Atualizar cache
        desafiosCache.data = desafios;
        desafiosCache.timestamp = now;
        
        res.json(desafios);
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
            return res.status(404).json({ error: 'Desafio não encontrado ou inativo' });
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
                ordem: pergunta.ordem
            };
        });

        res.json({
            ...desafio,
            perguntas: perguntasEmbaralhadas
        });

    } catch (error) {
        handleError(res, error, 'Erro ao carregar perguntas do desafio');
    }
});

// ✅ POST VERIFICAR RESPOSTAS DO DESAFIO
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
            return res.status(404).json({ error: 'Desafio não encontrado ou inativo' });
        }

        const usuario = await prisma.usuario.findUnique({
            where: { 
                id: userId,
                status: 'ativo'
            }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuário não encontrado ou inativo' });
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
                    dataConclusao: new Date()
                }
            });

            return usuarioAtualizado;
        });

        console.log(`✅ Desafio verificado: ${usuario.nome} acertou ${acertos}/${desafio.perguntas.length} (+${pontuacaoGanha} pontos)`);

        // Invalidar cache do ranking
        rankingCache.data = null;

        res.json({
            success: true,
            message: 'Desafio verificado com sucesso!',
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
        });

    } catch (error) {
        handleError(res, error, 'Erro ao verificar respostas do desafio');
    }
});

// ========== OUTRAS ROTAS (MANTIDAS) ========== //

// ... resto das rotas mantidas (cursos, videos, etc) ...

// ========== ROTAS DE ADMIN ========== //

// Middleware para admin
const isAdmin = async (req, res, next) => {
    try {
        // Verificar se o usuário é admin
        // Implementar lógica real de admin aqui
        const usuarioId = req.usuario?.id;
        
        if (!usuarioId) {
            return res.status(403).json({ error: 'Acesso não autorizado' });
        }
        
        // Verificar se é admin (exemplo simples)
        const usuario = await prisma.usuario.findUnique({
            where: { id: usuarioId }
        });
        
        if (!usuario || usuario.curso !== 'admin') {
            return res.status(403).json({ error: 'Acesso restrito a administradores' });
        }
        
        next();
    } catch (error) {
        res.status(500).json({ error: 'Erro na verificação de admin' });
    }
};

// Rotas de admin protegidas
app.get('/api/admin/usuarios', isAdmin, async (req, res) => {
    // Retornar todos os usuários (admin)
});

app.post('/api/admin/desafios', isAdmin, async (req, res) => {
    // Criar desafio (admin)
});

// ========== MANUSEIO DE ERROS GLOBAL ========== //

app.use((error, req, res, next) => {
    console.error('❌ Erro global não tratado:', error);
    
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: 'JSON inválido',
            details: 'O corpo da requisição contém JSON malformado'
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
            
            console.log('⏳ Aguardando 5 segundos antes da próxima tentativa...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function startServer() {
    try {
        console.log('🚀 Iniciando servidor Coliseum API...');
        
        const dbConnected = await initializeDatabase();
        
        if (!dbConnected) {
            console.error('❌ Não foi possível conectar ao banco de dados. Encerrando...');
            process.exit(1);
        }
        
        // Configurar timeout do servidor
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n📍 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🌐 Production: https://coliseum-api.onrender.com`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`\n✨ API Coliseum totalmente operacional!`);
        });
        
        // Configurar timeouts
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
