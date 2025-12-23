import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { encryptionService } from './services/encryption.service.js';
import { encryptResponseMiddleware, encryptRequestBodyMiddleware } from './middlewares/encryption.middleware.js';

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÕES ========== //

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  transactionOptions: {
    maxWait: 5000,
    timeout: 10000,
  }
});

// ========== DIAGNÓSTICO INICIAL ========== //
console.log('🔍 DIAGNÓSTICO DO AMBIENTE:');
console.log('1. Node Version:', process.version);
console.log('2. Diretório atual:', process.cwd());
console.log('3. NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('4. PORT:', process.env.PORT || 'not set');
console.log('5. DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configurada' : '❌ NÃO CONFIGURADA');

if (!process.env.DATABASE_URL) {
    console.error('❌ ERRO CRÍTICO: DATABASE_URL não configurada!');
    process.exit(1);
}

// ✅ CONFIGURAÇÃO CORS COMPLETA
const allowedOrigins = [
  'https://coliseum-7raywxzsu-icaroass-projects.vercel.app',
  'https://coliseum-of2dynr3p-icaroass-projects.vercel.app',
  'https://coliseum-adm.vercel.app',
  'https://coliseum-6hm18oy24-icaroass-projects.vercel.app',
  'https://coliseum-frontend.vercel.app',
  'https://coliseum-icaroass-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://coliseum-*.vercel.app',
  'https://*.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin === allowed) || 
        origin.endsWith('.vercel.app') ||
        origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      console.log('🚫 CORS bloqueado para origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-requested-with'],
  optionsSuccessStatus: 200
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// ========== MIDDLEWARE DE CRIPTOGRAFIA ========== //
app.use(encryptResponseMiddleware);

// Para rotas específicas que lidam com dados sensíveis
app.use('/api/videos', encryptRequestBodyMiddleware);
app.use('/api/aulas', encryptRequestBodyMiddleware);

// ========== MIDDLEWARE DE LOG E CONEXÃO ========== //

app.use(async (req, res, next) => {
  console.log(`\n=== NOVA REQUISIÇÃO ===`);
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  console.log('📍 Origin:', req.headers.origin);
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexão com banco está ativa');
  } catch (error) {
    console.warn('⚠️ Conexão com banco perdida, tentando reconectar...');
    try {
      await prisma.$disconnect();
      await prisma.$connect();
      console.log('✅ Conexão restabelecida');
    } catch (reconnectError) {
      console.error('❌ Falha ao reconectar:', reconnectError.message);
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível',
        message: 'Problema de conexão com o banco de dados'
      });
    }
  }
  
  console.log(`=======================\n`);
  next();
});

// ========== UTILITÁRIOS ========== //

const validateId = (id) => {
  if (!id) return null;
  const numId = parseInt(id);
  return !isNaN(numId) && numId > 0 ? numId : null;
};

const handleError = (res, error, message = 'Erro interno do servidor') => {
  console.error(`❌ ${message}:`, error);
  
  if (error.code === 'P2025') {
    return res.status(404).json({ 
      error: 'Registro não encontrado',
      details: 'O item solicitado não existe ou já foi removido'
    });
  }
  
  if (error.code === 'P2002') {
    return res.status(409).json({ 
      error: 'Conflito de dados',
      details: 'Já existe um registro com esses dados únicos'
    });
  }

  if (error.code === 'P1001') {
    return res.status(503).json({ 
      error: 'Database não disponível',
      details: 'Não foi possível conectar ao banco de dados'
    });
  }
  
  if (error.code === 'P1017') {
    return res.status(503).json({ 
      error: 'Conexão com banco fechada',
      details: 'A conexão com o banco de dados foi fechada'
    });
  }
  
  res.status(500).json({ 
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
  });
};

// Função auxiliar para atualizar progresso do módulo
async function atualizarProgressoModulo(usuarioId, moduloId) {
  try {
    const modulo = await prisma.modulo.findUnique({
      where: { id: moduloId },
      include: {
        curso: true,
        aulas: {
          where: { ativo: true }
        }
      }
    });

    if (!modulo) return;

    // Contar aulas concluídas neste módulo
    const aulasConcluidas = await prisma.progressoAula.count({
      where: {
        usuarioId: usuarioId,
        aulaId: {
          in: modulo.aulas.map(a => a.id)
        },
        concluida: true
      }
    });

    const totalAulasModulo = modulo.aulas.length;
    const progressoModulo = totalAulasModulo > 0 ? 
      Math.round((aulasConcluidas / totalAulasModulo) * 100) : 0;

    // Verificar/atualizar progresso do módulo
    const progressoModuloExistente = await prisma.progressoModulo.findFirst({
      where: {
        usuarioId: usuarioId,
        moduloId: moduloId
      }
    });

    if (progressoModuloExistente) {
      await prisma.progressoModulo.update({
        where: { id: progressoModuloExistente.id },
        data: {
          progresso: progressoModulo,
          atualizadoEm: new Date()
        }
      });
    } else {
      await prisma.progressoModulo.create({
        data: {
          usuarioId: usuarioId,
          moduloId: moduloId,
          progresso: progressoModulo
        }
      });
    }

    // Atualizar progresso geral do curso
    const todosModulosCurso = await prisma.modulo.findMany({
      where: {
        cursoId: modulo.cursoId,
        ativo: true
      },
      include: {
        aulas: {
          where: { ativo: true }
        }
      }
    });

    let totalAulasCurso = 0;
    let totalConcluidasCurso = 0;

    for (const mod of todosModulosCurso) {
      const concluidas = await prisma.progressoAula.count({
        where: {
          usuarioId: usuarioId,
          aulaId: {
            in: mod.aulas.map(a => a.id)
          },
          concluida: true
        }
      });
      
      totalAulasCurso += mod.aulas.length;
      totalConcluidasCurso += concluidas;
    }

    const progressoCurso = totalAulasCurso > 0 ? 
      Math.round((totalConcluidasCurso / totalAulasCurso) * 100) : 0;

    const progressoCursoExistente = await prisma.progressoCurso.findFirst({
      where: {
        usuarioId: usuarioId,
        cursoId: modulo.cursoId
      }
    });

    if (progressoCursoExistente) {
      await prisma.progressoCurso.update({
        where: { id: progressoCursoExistente.id },
        data: {
          progresso: progressoCurso,
          atualizadoEm: new Date()
        }
      });
    } else {
      await prisma.progressoCurso.create({
        data: {
          usuarioId: usuarioId,
          cursoId: modulo.cursoId,
          progresso: progressoCurso
        }
      });
    }

    console.log(`📊 Progresso atualizado - Usuário ${usuarioId}, Módulo ${moduloId}: ${progressoModulo}%, Curso ${modulo.cursoId}: ${progressoCurso}%`);

  } catch (error) {
    console.error('❌ Erro ao atualizar progresso do módulo:', error);
  }
}

function verificarPermissaoCurso(cursoUsuario, materiaCurso) {
    console.log(`🔐 Backend: Usuário=${cursoUsuario}, Matéria=${materiaCurso}`);
    
    if (!cursoUsuario || !materiaCurso) {
        return false;
    }
    
    let categoriaMateria = 'outros';
    const materiaLower = materiaCurso.toLowerCase();
    
    if (['algebra', 'geometria', 'quimica', 'fisica'].some(m => materiaLower.includes(m))) {
        categoriaMateria = 'reforco';
    } else if (['historia', 'geografia', 'gramatica'].some(m => materiaLower.includes(m))) {
        categoriaMateria = 'preparatorio';
    } else if (['python', 'javascript', 'html', 'css'].some(m => materiaLower.includes(m))) {
        categoriaMateria = 'programacao';
    } else if (['arduino', 'robotica'].some(m => materiaLower.includes(m))) {
        categoriaMateria = 'robotica';
    } else if (['unity', 'blender', 'game'].some(m => materiaLower.includes(m))) {
        categoriaMateria = 'games';
    } else if (['word', 'excel', 'powerpoint'].some(m => materiaLower.includes(m))) {
        categoriaMateria = 'informatica';
    }
    
    // Usuário só pode acessar sua própria categoria
    const resultado = cursoUsuario.toLowerCase() === categoriaMateria;
    
    console.log(`✅ Backend: ${cursoUsuario} → ${categoriaMateria}: ${resultado ? 'PERMITIDO' : 'BLOQUEADO'}`);
    
    return resultado;
}

// ========== CONEXÃO E CONFIGURAÇÃO DO BANCO ========== //

async function testDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexão com banco de dados estabelecida');
    return true;
  } catch (error) {
    console.error('❌ Erro na conexão com banco:', error);
    return false;
  }
}

async function initializeDatabase() {
  let retries = 5;
  let connected = false;
  
  while (retries > 0 && !connected) {
    try {
      console.log(`🔄 Tentando conectar ao banco de dados... (${retries} tentativas restantes)`);
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Conectado ao banco de dados com sucesso!');
      connected = true;
      
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
  
  return connected;
}

// ========== ROTAS BÁSICAS ========== //

app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Coliseum Backend - Online',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    database: 'connected',
    features: ['usuarios', 'videos', 'cursos', 'desafios', 'chat', 'amigos', 'progresso']
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await testDatabaseConnection();
    
    const [totalUsuarios, totalVideos, totalCursos, totalDesafios, totalAmizades, totalMensagensChat] = await Promise.all([
      prisma.usuario.count().catch(() => 0),
      prisma.video.count().catch(() => 0),
      prisma.curso.count().catch(() => 0),
      prisma.desafio.count().catch(() => 0),
      prisma.amizade.count().catch(() => 0),
      prisma.mensagemChat.count().catch(() => 0)
    ]);

    res.json({ 
      status: 'online',
      database: dbStatus ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      totalUsuarios,
      totalVideos,
      totalCursos,
      totalDesafios,
      totalAmizades,
      totalMensagensChat,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
      uptime: process.uptime()
    });
  }
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    res.json({
      success: true,
      message: 'Conexão com banco de dados estável',
      result
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Falha na conexão com banco',
      details: error.message
    });
  }
});

// ✅ ROTA DE TESTE DE CRIPTOGRAFIA
app.get('/api/test-encryption', async (req, res) => {
  try {
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    // Testar criptografia
    const encrypted = encryptionService.encryptYouTubeUrl(testUrl);
    const decrypted = encryptionService.decryptYouTubeUrl(encrypted);
    
    res.json({
      success: true,
      original: testUrl,
      encrypted: encrypted,
      decrypted: decrypted,
      match: testUrl === decrypted,
      algorithm: encryptionService.algorithm
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro no teste de criptografia',
      details: error.message
    });
  }
});

// ========== SISTEMA DE USUÁRIOS ========== //

// ✅ GET TODOS OS USUÁRIOS
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log('👥 Buscando todos os usuários...');
    
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

    console.log(`✅ ${usuarios.length} usuários carregados`);
    
    res.json(usuarios);
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
        criadoEm: true,
        atualizadoEm: true
      }
    });

    if (!usuario) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    console.log(`✅ Usuário encontrado: ${usuario.nome}`);
    
    res.json({
      success: true,
      usuario: usuario
    });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar usuário');
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

        const { nome, ra, serie, senha, curso, status = 'ativo' } = req.body;

        console.log('🔍 Dados recebidos:', { nome, ra, serie, curso, status });

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

        if (!/^\d{4}$/.test(ra.toString().trim())) {
            return res.status(400).json({
                error: 'RA inválido',
                details: 'O RA deve conter exatamente 4 dígitos numéricos'
            });
        }

        const usuarioExistente = await prisma.usuario.findUnique({
            where: { ra: ra.toString().trim() }
        });

        if (usuarioExistente) {
            return res.status(409).json({
                error: 'RA já cadastrado no sistema',
                details: `O RA ${ra} já está em uso por outro usuário.`
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

        console.log('✅ Usuário criado com sucesso - ID:', novoUsuario.id);
        const { senha: _, ...usuarioSemSenha } = novoUsuario;

        res.status(201).json({
            success: true,
            message: 'Usuário cadastrado com sucesso!',
            usuario: usuarioSemSenha
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

        if (usuario.status !== 'ativo') {
            console.log('❌ Usuário inativo tentou fazer login:', usuario.nome);
            return res.status(403).json({
                success: false,
                error: 'Usuário inativo. Contate o administrador.'
            });
        }

        console.log('✅ Usuário encontrado:', usuario.nome);

        if (usuario.senha !== senha.trim()) {
            console.log('❌ Senha incorreta para usuário:', usuario.nome);
            return res.status(401).json({
                success: false,
                error: 'Senha incorreta'
            });
        }

        console.log('✅ Login bem-sucedido para:', usuario.nome);
        const { senha: _, ...usuarioSemSenha } = usuario;

        res.json({
            success: true,
            message: 'Login realizado com sucesso!',
            usuario: usuarioSemSenha
        });

    } catch (error) {
        handleError(res, error, 'Erro no login');
    }
});

// ✅ RANKING
app.get('/api/ranking', async (req, res) => {
  try {
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
      orderBy: { pontuacao: 'desc' }
    });

    console.log(`📊 Ranking carregado: ${usuarios.length} usuários`);
    
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
    console.log(`✏️ Atualizando usuário ID: ${userId}`, req.body);

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (ra && ra !== usuarioExistente.ra) {
      if (!/^\d{4}$/.test(ra.toString().trim())) {
          return res.status(400).json({
              error: 'RA inválido',
              details: 'O RA deve conter exatamente 4 dígitos numéricos'
          });
      }
      
      const raExistente = await prisma.usuario.findUnique({
        where: { ra: ra.toString().trim() }
      });
      if (raExistente) {
        return res.status(409).json({
          error: 'RA já está em uso',
          details: `O RA ${ra} já pertence a outro usuário.`
        });
      }
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

    console.log(`✅ Usuário atualizado:`, usuarioAtualizado.nome);
    
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

    await prisma.usuario.delete({
      where: { id: userId }
    });

    console.log(`✅ Usuário excluído: ${usuarioExistente.nome}`);
    
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

// ========== SISTEMA DE AMIGOS ========== //

// ✅ GET LISTA DE AMIGOS DO USUÁRIO
app.get('/api/amigos/usuarios/:usuarioId/amigos', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`👥 Buscando amigos do usuário ID: ${usuarioId}`);

    const amizades = await prisma.amizade.findMany({
      where: {
        OR: [
          { usuarioId: usuarioId },
          { amigoId: usuarioId }
        ],
        status: 'aceito'
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true,
            serie: true,
            curso: true,
            pontuacao: true,
            status: true
          }
        },
        amigo: {
          select: {
            id: true,
            nome: true,
            ra: true,
            serie: true,
            curso: true,
            pontuacao: true,
            status: true
          }
        }
      }
    });

    const amigos = amizades.map(amizade => {
      if (amizade.usuarioId === usuarioId) {
        return {
          id: amizade.id,
          amigo: amizade.amigo,
          dataAdicao: amizade.criadoEm,
          status: amizade.status
        };
      } else {
        return {
          id: amizade.id,
          amigo: amizade.usuario,
          dataAdicao: amizade.criadoEm,
          status: amizade.status
        };
      }
    });

    console.log(`✅ ${amigos.length} amigos encontrados para o usuário ${usuarioId}`);

    res.json({
      success: true,
      amigos: amigos
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar amigos');
  }
});

// ✅ GET SOLICITAÇÕES DE AMIZADE PENDENTES
app.get('/api/amigos/usuarios/:usuarioId/solicitacoes', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`📩 Buscando solicitações pendentes para usuário ID: ${usuarioId}`);

    const solicitacoes = await prisma.amizade.findMany({
      where: {
        amigoId: usuarioId,
        status: 'pendente'
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true,
            serie: true,
            curso: true,
            pontuacao: true
          }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    console.log(`✅ ${solicitacoes.length} solicitações pendentes encontradas`);

    res.json({
      success: true,
      solicitacoes: solicitacoes
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar solicitações de amizade');
  }
});

// ✅ POST ENVIAR SOLICITAÇÃO DE AMIZADE
app.post('/api/amigos/usuarios/:usuarioId/solicitar/:amigoId', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    const amigoId = validateId(req.params.amigoId);
    
    if (!usuarioId || !amigoId) {
      return res.status(400).json({ error: 'IDs de usuário inválidos' });
    }

    if (usuarioId === amigoId) {
      return res.status(400).json({ error: 'Não é possível adicionar a si mesmo como amigo' });
    }

    console.log(`📤 Usuário ${usuarioId} solicitando amizade com ${amigoId}`);

    const [usuario, amigo] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: usuarioId } }),
      prisma.usuario.findUnique({ where: { id: amigoId } })
    ]);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!amigo) {
      return res.status(404).json({ error: 'Amigo não encontrado' });
    }

    const amizadeExistente = await prisma.amizade.findFirst({
      where: {
        OR: [
          { usuarioId: usuarioId, amigoId: amigoId },
          { usuarioId: amigoId, amigoId: usuarioId }
        ]
      }
    });

    if (amizadeExistente) {
      let mensagem = '';
      if (amizadeExistente.status === 'pendente') {
        if (amizadeExistente.usuarioId === usuarioId) {
          mensagem = 'Já existe uma solicitação pendente para este amigo';
        } else {
          mensagem = 'Este usuário já enviou uma solicitação para você. Verifique suas notificações.';
        }
      } else if (amizadeExistente.status === 'aceito') {
        mensagem = 'Vocês já são amigos';
      } else if (amizadeExistente.status === 'bloqueado') {
        mensagem = 'Esta amizade foi bloqueada';
      }
      
      return res.status(409).json({
        error: 'Amizade já existe',
        details: mensagem,
        status: amizadeExistente.status
      });
    }

    const novaAmizade = await prisma.amizade.create({
      data: {
        usuarioId: usuarioId,
        amigoId: amigoId,
        status: 'pendente'
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true
          }
        },
        amigo: {
          select: {
            id: true,
            nome: true,
            ra: true
          }
        }
      }
    });

    await prisma.notificacaoAmizade.create({
      data: {
        tipo: 'solicitacao_amizade',
        usuarioId: amigoId,
        remetenteId: usuarioId,
        lida: false
      }
    });

    console.log(`✅ Solicitação de amizade enviada: ${usuario.nome} -> ${amigo.nome}`);

    res.status(201).json({
      success: true,
      message: 'Solicitação de amizade enviada com sucesso!',
      amizade: novaAmizade
    });

  } catch (error) {
    handleError(res, error, 'Erro ao enviar solicitação de amizade');
  }
});

// ✅ PUT ACEITAR SOLICITAÇÃO DE AMIZADE
app.put('/api/amigos/usuarios/:usuarioId/aceitar/:amizadeId', async (req, res) => {
    try {
        const usuarioId = validateId(req.params.usuarioId);
        const amizadeId = validateId(req.params.amizadeId);
        
        if (!usuarioId || !amizadeId) {
            return res.status(400).json({ 
                success: false,
                error: 'IDs inválidos' 
            });
        }

        console.log(`✅ ACEITAR: Usuário ${usuarioId}, Amizade ${amizadeId}`);

        const amizade = await prisma.amizade.findUnique({
            where: { id: amizadeId }
        });

        if (!amizade) {
            console.log(`❌ Amizade não encontrada: ${amizadeId}`);
            return res.status(404).json({ 
                success: false,
                error: 'Solicitação não encontrada' 
            });
        }

        console.log('📊 Dados da amizade:', amizade);

        if (amizade.amigoId !== usuarioId) {
            console.log(`❌ Não autorizado: amigoId=${amizade.amigoId}, usuarioId=${usuarioId}`);
            return res.status(403).json({ 
                success: false,
                error: 'Não autorizado',
                details: 'Você só pode aceitar solicitações enviadas para você'
            });
        }

        if (amizade.status === 'aceito') {
            console.log(`ℹ️ Amizade já aceita: ${amizadeId}`);
            return res.status(400).json({ 
                success: false,
                error: 'Amizade já aceita' 
            });
        }

        if (amizade.status !== 'pendente') {
            console.log(`❌ Status inválido: ${amizade.status}`);
            return res.status(400).json({ 
                success: false,
                error: 'Status inválido',
                details: `Esta solicitação está ${amizade.status}`
            });
        }

        const amizadeAtualizada = await prisma.amizade.update({
            where: { id: amizadeId },
            data: {
                status: 'aceito',
                atualizadoEm: new Date()
            },
            include: {
                usuario: {
                    select: {
                        id: true,
                        nome: true,
                        ra: true
                    }
                },
                amigo: {
                    select: {
                        id: true,
                        nome: true,
                        ra: true
                    }
                }
            }
        });

        console.log(`✅ Amizade aceita: ID=${amizadeId}`);

        await prisma.notificacaoAmizade.create({
            data: {
                tipo: 'aceito_amizade',
                usuarioId: amizade.usuarioId,
                remetenteId: usuarioId,
                lida: false
            }
        });

        await prisma.notificacaoAmizade.deleteMany({
            where: {
                usuarioId: usuarioId,
                remetenteId: amizade.usuarioId,
                tipo: 'solicitacao_amizade'
            }
        });

        res.json({
            success: true,
            message: 'Solicitação de amizade aceita com sucesso!',
            amizade: amizadeAtualizada
        });

    } catch (error) {
        console.error('❌ Erro ao aceitar amizade:', error);
        handleError(res, error, 'Erro ao aceitar solicitação de amizade');
    }
});

// ✅ PUT REJEITAR SOLICITAÇÃO DE AMIZADE
app.put('/api/amigos/usuarios/:usuarioId/rejeitar/:amizadeId', async (req, res) => {
    try {
        const usuarioId = validateId(req.params.usuarioId);
        const amizadeId = validateId(req.params.amizadeId);
        
        if (!usuarioId || !amizadeId) {
            return res.status(400).json({ 
                success: false,
                error: 'IDs inválidos' 
            });
        }

        console.log(`❌ REJEITAR: Usuário ${usuarioId}, Amizade ${amizadeId}`);

        const amizade = await prisma.amizade.findUnique({
            where: { id: amizadeId }
        });

        if (!amizade) {
            return res.status(404).json({ 
                success: false,
                error: 'Solicitação não encontrada' 
            });
        }

        if (amizade.amigoId !== usuarioId) {
            return res.status(403).json({ 
                success: false,
                error: 'Não autorizado',
                details: 'Você só pode rejeitar solicitações enviadas para você'
            });
        }

        if (amizade.status !== 'pendente') {
            return res.status(400).json({ 
                success: false,
                error: 'Status inválido',
                details: `Esta solicitação está ${amizade.status}`
            });
        }

        await prisma.amizade.delete({
            where: { id: amizadeId }
        });

        console.log(`✅ Amizade rejeitada e removida: ID=${amizadeId}`);

        await prisma.notificacaoAmizade.deleteMany({
            where: {
                OR: [
                    {
                        usuarioId: usuarioId,
                        remetenteId: amizade.usuarioId,
                        tipo: 'solicitacao_amizade'
                    },
                    {
                        usuarioId: amizade.usuarioId,
                        remetenteId: usuarioId,
                        tipo: 'solicitacao_amizade'
                    }
                ]
            }
        });

        res.json({
            success: true,
            message: 'Solicitação de amizade rejeitada com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro ao rejeitar amizade:', error);
        handleError(res, error, 'Erro ao rejeitar solicitação de amizade');
    }
});

// ✅ DELETE REMOVER AMIGO
app.delete('/api/amigos/usuarios/:usuarioId/amigos/:amigoId', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    const amigoId = validateId(req.params.amigoId);
    
    if (!usuarioId || !amigoId) {
      return res.status(400).json({ error: 'IDs de usuário inválidos' });
    }

    console.log(`🗑️ Usuário ${usuarioId} removendo amigo ${amigoId}`);

    const amizade = await prisma.amizade.findFirst({
      where: {
        OR: [
          { usuarioId: usuarioId, amigoId: amigoId },
          { usuarioId: amigoId, amigoId: usuarioId }
        ],
        status: 'aceito'
      }
    });

    if (!amizade) {
      return res.status(404).json({ error: 'Amizade não encontrada' });
    }

    await prisma.amizade.delete({
      where: { id: amizade.id }
    });

    console.log(`✅ Amizade removida entre usuários ${usuarioId} e ${amigoId}`);

    res.json({
      success: true,
      message: 'Amigo removido com sucesso!'
    });

  } catch (error) {
    handleError(res, error, 'Erro ao remover amigo');
  }
});

// ✅ GET BUSCAR USUÁRIOS PARA ADICIONAR COMO AMIGOS
app.get('/api/amigos/usuarios/buscar', async (req, res) => {
  try {
    const { query, usuarioId } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Termo de busca muito curto',
        details: 'Digite pelo menos 2 caracteres para buscar'
      });
    }

    const currentUserId = validateId(usuarioId);
    
    console.log(`🔍 Buscando usuários com: "${query}"`);

    const usuarios = await prisma.usuario.findMany({
      where: {
        AND: [
          {
            OR: [
              { nome: { contains: query, mode: 'insensitive' } },
              { ra: { contains: query, mode: 'insensitive' } }
            ]
          },
          { status: 'ativo' },
          currentUserId ? { id: { not: currentUserId } } : {}
        ]
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
      take: 20,
      orderBy: { nome: 'asc' }
    });

    if (currentUserId) {
      const usuariosComStatus = await Promise.all(
        usuarios.map(async (usuario) => {
          const amizade = await prisma.amizade.findFirst({
            where: {
              OR: [
                { usuarioId: currentUserId, amigoId: usuario.id },
                { usuarioId: usuario.id, amigoId: currentUserId }
              ]
            }
          });

          return {
            ...usuario,
            statusAmizade: amizade ? amizade.status : null,
            amizadeId: amizade ? amizade.id : null
          };
        })
      );

      res.json({
        success: true,
        resultados: usuariosComStatus
      });
    } else {
      res.json({
        success: true,
        resultados: usuarios
      });
    }

  } catch (error) {
    handleError(res, error, 'Erro ao buscar usuários');
  }
});

// ✅ GET NOTIFICAÇÕES DE AMIZADE
app.get('/api/amigos/usuarios/:usuarioId/notificacoes', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`🔔 Buscando notificações do usuário ID: ${usuarioId}`);

    const notificacoes = await prisma.notificacaoAmizade.findMany({
      where: {
        usuarioId: usuarioId,
        lida: false
      },
      include: {
        remetente: {
          select: {
            id: true,
            nome: true,
            ra: true,
            serie: true,
            curso: true
          }
        }
      },
      orderBy: { criadoEm: 'desc' },
      take: 50
    });

    console.log(`✅ ${notificacoes.length} notificações encontradas`);

    res.json({
      success: true,
      notificacoes: notificacoes
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar notificações');
  }
});

// ✅ PUT MARCAR NOTIFICAÇÃO COMO LIDA
app.put('/api/amigos/notificacoes/:notificacaoId/ler', async (req, res) => {
  try {
    const notificacaoId = validateId(req.params.notificacaoId);
    if (!notificacaoId) {
      return res.status(400).json({ error: 'ID da notificação inválido' });
    }

    console.log(`📌 Marcando notificação ${notificacaoId} como lida`);

    const notificacao = await prisma.notificacaoAmizade.findUnique({
      where: { id: notificacaoId }
    });

    if (!notificacao) {
      return res.status(404).json({ error: 'Notificação não encontrada' });
    }

    await prisma.notificacaoAmizade.update({
      where: { id: notificacaoId },
      data: { lida: true }
    });

    console.log(`✅ Notificação ${notificacaoId} marcada como lida`);

    res.json({
      success: true,
      message: 'Notificação marcada como lida'
    });

  } catch (error) {
    handleError(res, error, 'Erro ao marcar notificação como lida');
  }
});

// ✅ GET AMIGOS ONLINE (SIMULADO)
app.get('/api/amigos/usuarios/:usuarioId/amigos/online', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`💚 Buscando amigos online do usuário ID: ${usuarioId}`);

    const amizades = await prisma.amizade.findMany({
      where: {
        OR: [
          { usuarioId: usuarioId },
          { amigoId: usuarioId }
        ],
        status: 'aceito'
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true,
            curso: true,
            pontuacao: true
          }
        },
        amigo: {
          select: {
            id: true,
            nome: true,
            ra: true,
            curso: true,
            pontuacao: true
          }
        }
      }
    });

    const amigos = amizades.map(amizade => {
      const isUsuario = amizade.usuarioId === usuarioId;
      const amigo = isUsuario ? amizade.amigo : amizade.usuario;
      
      return {
        id: amigo.id,
        nome: amigo.nome,
        ra: amigo.ra,
        curso: amigo.curso,
        pontuacao: amigo.pontuacao,
        online: Math.random() > 0.3,
        ultimaAtividade: new Date(Date.now() - Math.random() * 3600000).toISOString()
      };
    });

    const amigosOnline = amigos.filter(a => a.online);
    
    console.log(`✅ ${amigosOnline.length} de ${amigos.length} amigos online`);

    res.json({
      success: true,
      amigosOnline: amigosOnline,
      totalAmigos: amigos.length
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar amigos online');
  }
});

// ========== SISTEMA DE CHAT ========== //

app.get('/api/chat/mensagens', async (req, res) => {
  try {
    console.log('💬 Buscando mensagens do chat...');
    
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const mensagens = await prisma.mensagemChat.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true,
            serie: true,
            curso: true
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit),
      skip: skip
    });

    const totalMensagens = await prisma.mensagemChat.count();
    
    console.log(`✅ ${mensagens.length} mensagens carregadas`);
    
    res.json({
      success: true,
      mensagens: mensagens.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalMensagens,
        totalPages: Math.ceil(totalMensagens / parseInt(limit))
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar mensagens do chat');
  }
});

app.get('/api/chat/mensagens/recentes', async (req, res) => {
  try {
    console.log('💬 Buscando mensagens recentes do chat...');
    
    const mensagens = await prisma.mensagemChat.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true,
            serie: true,
            curso: true,
            pontuacao: true
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    console.log(`✅ ${mensagens.length} mensagens recentes carregadas`);
    
    res.json({
      success: true,
      mensagens: mensagens.reverse() 
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar mensagens recentes');
  }
});

// ✅ ROTA CORRIGIDA PARA ENVIO DE MENSAGENS
app.post('/api/chat/mensagens', async (req, res) => {
    try {
        console.log('📝 Recebendo nova mensagem...');
        
        const { usuarioId, conteudo, tipo = 'texto', isAdmin = false } = req.body;

        // VALIDAÇÃO FLEXIBILIZADA
        if (!conteudo || conteudo.trim() === '') {
            return res.status(400).json({
                error: 'Conteúdo da mensagem é obrigatório'
            });
        }

        let usuario = null;
        
        // Se NÃO for admin e tiver usuarioId, validar usuário
        if (!isAdmin) {
            if (!usuarioId) {
                return res.status(400).json({
                    error: 'ID do usuário é obrigatório para mensagens não-administrativas'
                });
            }
            
            usuario = await prisma.usuario.findUnique({
                where: { id: parseInt(usuarioId) },
                select: { id: true, nome: true, status: true }
            });

            if (!usuario) {
                return res.status(404).json({
                    error: 'Usuário não encontrado'
                });
            }

            if (usuario.status !== 'ativo') {
                return res.status(403).json({
                    error: 'Usuário inativo'
                });
            }
        }
        // Se FOR admin, pode enviar sem usuarioId válido
        else if (isAdmin && !usuarioId) {
            console.log('👑 Mensagem administrativa recebida');
        }

        if (conteudo.trim().length > 1000) {
            return res.status(400).json({
                error: 'Mensagem muito longa',
                details: 'A mensagem não pode ter mais de 1000 caracteres'
            });
        }

        console.log(`💬 ${isAdmin ? 'Admin' : 'Usuário ' + usuario?.nome} enviando mensagem...`);

        // DADOS PARA SALVAR NO BANCO
        const dadosMensagem = {
            conteudo: conteudo.trim(),
            tipo: tipo,
            timestamp: new Date()
        };

        // Se tiver usuarioId (admin ou não), vincular ao usuário
        if (usuarioId) {
            dadosMensagem.usuarioId = parseInt(usuarioId);
        }
        // Se for admin sem usuarioId, salvar como mensagem do sistema
        else if (isAdmin) {
            dadosMensagem.usuarioId = null; // Mensagem do sistema
            dadosMensagem.conteudo = `👑 ADMIN: ${conteudo.trim()}`;
            dadosMensagem.tipo = 'admin';
        }

        const novaMensagem = await prisma.mensagemChat.create({
            data: dadosMensagem,
            include: {
                usuario: {
                    select: {
                        id: true,
                        nome: true,
                        ra: true,
                        serie: true,
                        curso: true,
                        pontuacao: true
                    }
                }
            }
        });

        console.log(`✅ Mensagem enviada: "${conteudo.substring(0, 30)}..."`);

        res.status(201).json({
            success: true,
            message: 'Mensagem enviada com sucesso!',
            mensagem: novaMensagem
        });

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        res.status(500).json({
            error: 'Erro ao enviar mensagem',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
        });
    }
});

app.delete('/api/chat/mensagens/:id', async (req, res) => {
  try {
    const mensagemId = validateId(req.params.id);
    if (!mensagemId) {
      return res.status(400).json({ error: 'ID da mensagem inválido' });
    }

    const { usuarioId, isAdmin = false } = req.body;

    const mensagem = await prisma.mensagemChat.findUnique({
      where: { id: mensagemId },
      include: { usuario: true }
    });

    if (!mensagem) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (!isAdmin && mensagem.usuarioId !== parseInt(usuarioId)) {
      return res.status(403).json({
        error: 'Não autorizado',
        details: 'Você só pode excluir suas próprias mensagens'
      });
    }

    await prisma.mensagemChat.delete({
      where: { id: mensagemId }
    });

    console.log(`🗑️ Mensagem excluída: ${mensagemId}`);

    res.json({
      success: true,
      message: 'Mensagem excluída com sucesso!'
    });

  } catch (error) {
    handleError(res, error, 'Erro ao excluir mensagem');
  }
});

app.get('/api/chat/estatisticas', async (req, res) => {
  try {
    const [totalMensagens, usuariosAtivos, ultimaMensagem] = await Promise.all([
      prisma.mensagemChat.count(),
      prisma.usuario.count({ where: { status: 'ativo' } }),
      prisma.mensagemChat.findFirst({
        orderBy: { timestamp: 'desc' },
        include: {
          usuario: {
            select: {
              nome: true,
              ra: true
            }
          }
        }
      })
    ]);

    res.json({
      success: true,
      estatisticas: {
        totalMensagens,
        usuariosAtivos,
        ultimaMensagem: ultimaMensagem ? {
          usuario: ultimaMensagem.usuario.nome,
          conteudo: ultimaMensagem.conteudo.substring(0, 50) + '...',
          timestamp: ultimaMensagem.timestamp
        } : null
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar estatísticas do chat');
  }
});

app.delete('/api/chat/mensagens/todas', async (req, res) => {
  try {
    console.log('🗑️ Limpando todas as mensagens do chat...');
    
    const { isAdmin } = req.body;
    
    if (!isAdmin) {
      return res.status(403).json({
        error: 'Não autorizado',
        details: 'Apenas administradores podem limpar o chat'
      });
    }
    
    const count = await prisma.mensagemChat.deleteMany({});
    
    console.log(`✅ ${count.count} mensagens excluídas`);
    
    res.json({
      success: true,
      message: `Chat limpo com sucesso! ${count.count} mensagens removidas.`,
      count: count.count
    });
    
  } catch (error) {
    handleError(res, error, 'Erro ao limpar chat');
  }
});

// ✅ PUT ATUALIZAR MENSAGEM DO CHAT (nova)
app.put('/api/chat/mensagens/:id', async (req, res) => {
  try {
    const mensagemId = validateId(req.params.id);
    if (!mensagemId) {
      return res.status(400).json({ error: 'ID da mensagem inválido' });
    }

    const { conteudo, isAdmin } = req.body;

    if (!conteudo || conteudo.trim() === '') {
      return res.status(400).json({
        error: 'Conteúdo inválido',
        details: 'O conteúdo da mensagem é obrigatório'
      });
    }

    if (!isAdmin) {
      return res.status(403).json({
        error: 'Não autorizado',
        details: 'Apenas administradores podem editar mensagens'
      });
    }

    console.log(`✏️ Editando mensagem ID: ${mensagemId}`);

    const mensagem = await prisma.mensagemChat.findUnique({
      where: { id: mensagemId }
    });

    if (!mensagem) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    const mensagemAtualizada = await prisma.mensagemChat.update({
      where: { id: mensagemId },
      data: {
        conteudo: conteudo.trim(),
        timestamp: new Date()
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            ra: true
          }
        }
      }
    });

    console.log(`✅ Mensagem editada: ${mensagemId}`);

    res.json({
      success: true,
      message: 'Mensagem editada com sucesso!',
      mensagem: mensagemAtualizada
    });

  } catch (error) {
    handleError(res, error, 'Erro ao editar mensagem');
  }
});

// ========== SISTEMA DE CURSOS ========== //

app.get('/api/cursos', async (req, res) => {
  try {
    console.log('📚 Buscando todos os cursos...');
    
    const { usuarioId } = req.query;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;
    
    let cursos = await prisma.curso.findMany({
      where: { ativo: true },
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
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    // ✅ FILTRAR CURSOS POR PERMISSÃO DO USUÁRIO
    if (usuarioIdValidado) {
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioIdValidado },
        select: { curso: true, nome: true }
      });

      if (usuario) {
        cursos = cursos.filter(curso => 
          verificarPermissaoCurso(usuario.curso, curso.materia)
        );
        console.log(`✅ Cursos filtrados para ${usuario.nome} (${usuario.curso}): ${cursos.length} cursos permitidos`);
      }
    }

    console.log(`✅ ${cursos.length} cursos carregados`);
    
    // ✅ GARANTIR QUE O RETORNO SEJA JSON VÁLIDO
    const respostaJSON = JSON.stringify(cursos);
    
    // VERIFICAÇÃO DE SEGURANÇA
    try {
      JSON.parse(respostaJSON); // Testa se é JSON válido
      
      // Define cabeçalho correto e envia
      res.setHeader('Content-Type', 'application/json');
      res.send(respostaJSON);
      
    } catch (jsonError) {
      console.error('❌ ERRO: Tentativa de enviar JSON inválido!');
      console.error('Conteúdo problemático:', respostaJSON.substring(0, 500));
      
      // Envia resposta segura em caso de erro
      res.status(500).json({
        success: false,
        error: 'Erro ao processar dados',
        message: 'Erro interno no formato dos dados'
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao carregar cursos:', error);
    handleError(res, error, 'Erro ao carregar cursos');
  }
});

// ✅ POST CRIAR CURSO
app.post('/api/cursos', async (req, res) => {
  try {
    console.log('📝 Recebendo requisição POST /api/cursos');
    
    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo = true, modulos } = req.body;

    const requiredFields = ['titulo', 'materia', 'categoria', 'nivel', 'duracao'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        missingFields: missingFields,
        message: 'Campos obrigatórios faltando'
      });
    }

    console.log('📝 Dados válidados, criando curso...');

    const novoCurso = await prisma.$transaction(async (tx) => {
      const curso = await tx.curso.create({
        data: {
          titulo: titulo.trim(),
          descricao: descricao?.trim() || '',
          materia: materia.trim(),
          categoria: categoria.trim(),
          nivel: nivel.trim(),
          duracao: parseInt(duracao),
          imagem: imagem?.trim() || null,
          ativo: ativo,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        }
      });

      console.log(`✅ Curso criado com ID: ${curso.id}`);

      if (modulos && Array.isArray(modulos) && modulos.length > 0) {
        for (let i = 0; i < modulos.length; i++) {
          const moduloData = modulos[i];
          
          if (!moduloData.titulo || moduloData.titulo.trim() === '') {
            throw new Error(`Módulo ${i + 1} não tem título`);
          }

          const modulo = await tx.modulo.create({
            data: {
              titulo: moduloData.titulo.trim(),
              descricao: moduloData.descricao?.trim() || '',
              ordem: moduloData.ordem || (i + 1),
              cursoId: curso.id,
              ativo: true,
              criadoEm: new Date(),
              atualizadoEm: new Date()
            }
          });

          if (moduloData.aulas && Array.isArray(moduloData.aulas) && moduloData.aulas.length > 0) {
            for (let j = 0; j < moduloData.aulas.length; j++) {
              const aulaData = moduloData.aulas[j];
              
              if (!aulaData.titulo || aulaData.titulo.trim() === '') {
                throw new Error(`Módulo ${i + 1}, Aula ${j + 1} não tem título`);
              }

              await tx.aula.create({
                data: {
                  titulo: aulaData.titulo.trim(),
                  descricao: aulaData.descricao?.trim() || '',
                  conteudo: aulaData.conteudo?.trim() || '',
                  videoUrl: aulaData.videoUrl?.trim() || null,
                  duracao: parseInt(aulaData.duracao) || 15,
                  ordem: aulaData.ordem || (j + 1),
                  moduloId: modulo.id,
                  ativo: true,
                  criadoEm: new Date(),
                  atualizadoEm: new Date()
                }
              });
            }
            console.log(`✅ ${moduloData.aulas.length} aulas criadas para módulo ${i + 1}`);
          }
        }

        console.log(`✅ ${modulos.length} módulos criados`);
      }

      return await tx.curso.findUnique({
        where: { id: curso.id },
        include: {
          modulos: {
            include: { 
              aulas: {
                orderBy: { ordem: 'asc' }
              }
            },
            orderBy: { ordem: 'asc' }
          }
        }
      });
    });

    console.log('🎉 Curso criado com sucesso!');

    res.status(201).json({
      success: true,
      message: 'Curso criado com sucesso!',
      curso: novoCurso
    });

  } catch (error) {
    console.error('❌ Erro ao criar curso:', error);
    
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Erro de chave estrangeira',
        details: 'O curso ou módulo relacionado não existe'
      });
    }
    
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflito de dados',
        details: 'Já existe um curso com esses dados'
      });
    }
    
    res.status(500).json({
      error: 'Erro ao criar curso',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
  }
}); 

app.get('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    const { usuarioId } = req.query;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;

    console.log(`🎯 Buscando curso específico ID: ${cursoId} ${usuarioIdValidado ? 'para usuário ' + usuarioIdValidado : ''}`);

    const curso = await prisma.curso.findUnique({
      where: { 
        id: cursoId, 
        ativo: true 
      },
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
        }
      }
    });

    if (!curso) {
      return res.status(404).json({ 
        success: false,
        error: 'Curso não encontrado' 
      });
    }

    // ✅ VALIDAÇÃO DE PERMISSÃO
    if (usuarioIdValidado) {
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioIdValidado },
        select: { curso: true }
      });

      if (usuario && !verificarPermissaoCurso(usuario.curso, curso.materia)) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: `Usuários do curso ${usuario.curso} não podem acessar cursos de ${curso.materia}`,
          cursoUsuario: usuario.curso,
          materiaCurso: curso.materia
        });
      }
    }

    // Se houver usuário, buscar progresso
    let cursoComProgresso = curso;
    if (usuarioIdValidado) {
      const progressoCurso = await prisma.progressoCurso.findFirst({
        where: {
          usuarioId: usuarioIdValidado,
          cursoId: cursoId
        }
      });

      const modulosComProgresso = await Promise.all(
        curso.modulos.map(async (modulo) => {
          const progressoModulo = await prisma.progressoModulo.findFirst({
            where: {
              usuarioId: usuarioIdValidado,
              moduloId: modulo.id
            }
          });

          const aulasComProgresso = await Promise.all(
            modulo.aulas.map(async (aula) => {
              const progressoAula = await prisma.progressoAula.findFirst({
                where: {
                  usuarioId: usuarioIdValidado,
                  aulaId: aula.id
                }
              });

              return {
                ...aula,
                concluida: progressoAula?.concluida || false,
                dataConclusao: progressoAula?.dataConclusao
              };
            })
          );

          return {
            ...modulo,
            aulas: aulasComProgresso,
            progresso: progressoModulo?.progresso || 0
          };
        })
      );

      cursoComProgresso = {
        ...curso,
        modulos: modulosComProgresso,
        progresso: progressoCurso?.progresso || 0
      };
    }

    res.json({
      success: true,
      curso: cursoComProgresso
    });

  } catch (error) {
    handleError(res, error, 'Erro ao carregar curso');
  }
});

// ✅ GET MÓDULOS DO CURSO COM PROGRESSO DO USUÁRIO
app.get('/api/cursos/:id/modulos', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    const { usuarioId } = req.query;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;

    console.log(`📚 Buscando módulos do curso ${cursoId} ${usuarioIdValidado ? 'com progresso do usuário ' + usuarioIdValidado : ''}`);

    const modulos = await prisma.modulo.findMany({
      where: {
        cursoId: cursoId,
        ativo: true
      },
      include: {
        aulas: {
          where: { ativo: true },
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            duracao: true,
            ordem: true,
            videoUrl: true,
            conteudo: true,
            criadoEm: true
          }
        }
      },
      orderBy: { ordem: 'asc' }
    });

    // Se houver usuário, buscar progresso
    let modulosComProgresso = modulos;
    if (usuarioIdValidado) {
      modulosComProgresso = await Promise.all(
        modulos.map(async (modulo) => {
          const progressoAulas = await Promise.all(
            modulo.aulas.map(async (aula) => {
              const progresso = await prisma.progressoAula.findFirst({
                where: {
                  usuarioId: usuarioIdValidado,
                  aulaId: aula.id,
                  concluida: true
                }
              });
              
              return {
                ...aula,
                concluida: !!progresso,
                dataConclusao: progresso?.dataConclusao
              };
            })
          );

          const aulasConcluidas = progressoAulas.filter(a => a.concluida).length;
          const progresso = modulo.aulas.length > 0 ? 
            Math.round((aulasConcluidas / modulo.aulas.length) * 100) : 0;

          return {
            ...modulo,
            aulas: progressoAulas,
            progresso: progresso,
            aulasConcluidas: aulasConcluidas,
            totalAulas: modulo.aulas.length
          };
        })
      );
    }

    res.json({
      success: true,
      modulos: modulosComProgresso
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar módulos do curso');
  }
});

// ✅ GET AULA POR ID
// ✅ GET AULA POR ID (com descriptografia)
app.get('/api/aulas/:id', async (req, res) => {
  try {
    const aulaId = validateId(req.params.id);
    if (!aulaId) {
      return res.status(400).json({ error: 'ID da aula inválido' });
    }

    const { usuarioId } = req.query;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;

    console.log(`🎓 Buscando aula ${aulaId} ${usuarioIdValidado ? 'para usuário ' + usuarioIdValidado : ''}`);

    const aula = await prisma.aula.findUnique({
      where: { 
        id: aulaId,
        ativo: true 
      },
      include: {
        modulo: {
          include: {
            curso: {
              select: {
                id: true,
                titulo: true,
                materia: true
              }
            }
          }
        }
      }
    });

    if (!aula) {
      return res.status(404).json({ 
        success: false,
        error: 'Aula não encontrada' 
      });
    }

    let progresso = null;
    if (usuarioIdValidado) {
      progresso = await prisma.progressoAula.findFirst({
        where: {
          usuarioId: usuarioIdValidado,
          aulaId: aulaId
        }
      });
    }

    // Descriptografar videoUrl
    const aulaDescriptografada = {
      ...aula,
      videoUrl: aula.videoUrl ? encryptionService.decryptYouTubeUrl({
        encrypted: aula.videoUrl,
        iv: aula.videoIv,
        tag: aula.videoTag
      }) : null,
      concluida: progresso?.concluida || false,
      dataConclusao: progresso?.dataConclusao
    };

    res.json({
      success: true,
      aula: aulaDescriptografada
    });
  } catch (error) {
    handleError(res, error, 'Erro ao carregar aula');
  }
});

// ✅ PUT ATUALIZAR CURSO
app.put('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) return res.status(400).json({ error: 'ID do curso inválido' });

    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo } = req.body;
    
    const cursoExistente = await prisma.curso.findUnique({ where: { id: cursoId } });
    if (!cursoExistente) return res.status(404).json({ error: 'Curso não encontrado' });

    const updateData = { atualizadoEm: new Date() };
    
    if (titulo !== undefined) updateData.titulo = titulo.trim();
    if (descricao !== undefined) updateData.descricao = descricao.trim();
    if (materia !== undefined) updateData.materia = materia.trim();
    if (categoria !== undefined) updateData.categoria = categoria.trim();
    if (nivel !== undefined) updateData.nivel = nivel.trim();
    if (duracao !== undefined) updateData.duracao = parseInt(duracao);
    if (imagem !== undefined) updateData.imagem = imagem?.trim() || null;
    if (ativo !== undefined) updateData.ativo = ativo;

    const cursoAtualizado = await prisma.curso.update({
      where: { id: cursoId },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Curso atualizado com sucesso!',
      curso: cursoAtualizado
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

    const cursoExistente = await prisma.curso.findUnique({ where: { id: cursoId } });
    if (!cursoExistente) return res.status(404).json({ error: 'Curso não encontrado' });

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
      cursoId: cursoId
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir curso');
  }
});

// ========== SISTEMA DE PROGRESSO ========== //

// ✅ POST SALVAR PROGRESSO DE AULA
app.post('/api/progresso/aula', async (req, res) => {
  try {
    const { usuarioId, aulaId, concluida } = req.body;

    if (!usuarioId || !aulaId) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        details: 'Forneça usuarioId e aulaId'
      });
    }

    console.log(`📊 Salvando progresso - Usuário: ${usuarioId}, Aula: ${aulaId}`);

    const usuario = await prisma.usuario.findUnique({
      where: { id: parseInt(usuarioId) }
    });

    if (!usuario) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuário não encontrado' 
      });
    }

    const aula = await prisma.aula.findUnique({
      where: { id: parseInt(aulaId) }
    });

    if (!aula) {
      return res.status(404).json({ 
        success: false,
        error: 'Aula não encontrada' 
      });
    }

    // Verificar se já existe progresso
    const progressoExistente = await prisma.progressoAula.findFirst({
      where: {
        usuarioId: parseInt(usuarioId),
        aulaId: parseInt(aulaId)
      }
    });

    let progresso;

    if (progressoExistente) {
      // Atualizar progresso existente
      progresso = await prisma.progressoAula.update({
        where: { id: progressoExistente.id },
        data: {
          concluida: concluida !== undefined ? concluida : true,
          dataConclusao: concluida !== false ? new Date() : null,
          atualizadoEm: new Date()
        }
      });
    } else {
      // Criar novo progresso
      progresso = await prisma.progressoAula.create({
        data: {
          usuarioId: parseInt(usuarioId),
          aulaId: parseInt(aulaId),
          concluida: concluida !== undefined ? concluida : true,
          dataConclusao: concluida !== false ? new Date() : null
        }
      });
    }

    console.log(`✅ Progresso salvo: ${progresso.id}`);

    // Atualizar progresso do módulo e curso
    await atualizarProgressoModulo(parseInt(usuarioId), aula.moduloId);

    res.json({
      success: true,
      message: 'Progresso salvo com sucesso!',
      progresso: progresso
    });

  } catch (error) {
    handleError(res, error, 'Erro ao salvar progresso da aula');
  }
});

// ✅ GET PROGRESSO DO USUÁRIO EM UM CURSO
app.get('/api/progresso/cursos/:cursoId', async (req, res) => {
  try {
    const cursoId = validateId(req.params.cursoId);
    const { usuarioId } = req.query;

    if (!cursoId || !usuarioId) {
      return res.status(400).json({ 
        error: 'Parâmetros necessários',
        details: 'Forneça cursoId e usuarioId'
      });
    }

    const usuarioIdValidado = validateId(usuarioId);
    if (!usuarioIdValidado) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    console.log(`📊 Buscando progresso do curso ${cursoId} para usuário ${usuarioIdValidado}`);

    const curso = await prisma.curso.findUnique({
      where: { id: cursoId, ativo: true },
      include: {
        modulos: {
          where: { ativo: true },
          include: {
            aulas: {
              where: { ativo: true },
              orderBy: { ordem: 'asc' },
              include: {
                progressos: {
                  where: { 
                    usuarioId: usuarioIdValidado,
                    concluida: true 
                  }
                }
              }
            }
          },
          orderBy: { ordem: 'asc' }
        }
      }
    });

    if (!curso) {
      return res.status(404).json({ 
        success: false,
        error: 'Curso não encontrado' 
      });
    }

    let aulasTotais = 0;
    let aulasConcluidas = 0;

    const modulosComProgresso = curso.modulos.map(modulo => {
      const aulasModulo = modulo.aulas;
      const aulasConcluidasModulo = aulasModulo.filter(aula => 
        aula.progressos.length > 0
      ).length;

      aulasTotais += aulasModulo.length;
      aulasConcluidas += aulasConcluidasModulo;

      return {
        ...modulo,
        totalAulas: aulasModulo.length,
        aulasConcluidas: aulasConcluidasModulo,
        progresso: aulasModulo.length > 0 ? 
          Math.round((aulasConcluidasModulo / aulasModulo.length) * 100) : 0
      };
    });

    const progressoGeral = aulasTotais > 0 ? 
      Math.round((aulasConcluidas / aulasTotais) * 100) : 0;

    res.json({
      success: true,
      progresso: {
        cursoId: curso.id,
        cursoTitulo: curso.titulo,
        aulasTotais,
        aulasConcluidas,
        progresso: progressoGeral,
        modulos: modulosComProgresso,
        ultimaAtualizacao: new Date().toISOString()
      }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar progresso do curso');
  }
});

// ✅ GET AULAS CONCLUÍDAS POR USUÁRIO
app.get('/api/progresso/usuarios/:usuarioId/aulas-concluidas', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const progressos = await prisma.progressoAula.findMany({
      where: { 
        usuarioId: usuarioId,
        concluida: true 
      },
      include: {
        aula: {
          include: {
            modulo: {
              include: {
                curso: {
                  select: {
                    id: true,
                    titulo: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { dataConclusao: 'desc' },
      take: 100
    });

    res.json({
      success: true,
      aulasConcluidas: progressos.map(p => ({
        progressoId: p.id,
        aulaId: p.aulaId,
        aulaTitulo: p.aula.titulo,
        moduloTitulo: p.aula.modulo.titulo,
        cursoId: p.aula.modulo.curso.id,
        cursoTitulo: p.aula.modulo.curso.titulo,
        dataConclusao: p.dataConclusao
      }))
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar aulas concluídas');
  }
});

// ✅ GET PROGRESSO GERAL DO USUÁRIO (TODOS OS CURSOS)
app.get('/api/progresso/usuarios/:usuarioId/geral', async (req, res) => {
  try {
    const usuarioId = validateId(req.params.usuarioId);
    if (!usuarioId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        progressoCursos: {
          include: {
            curso: {
              select: {
                id: true,
                titulo: true,
                materia: true,
                categoria: true,
                nivel: true,
                duracao: true
              }
            }
          },
          orderBy: { atualizadoEm: 'desc' }
        }
      }
    });

    if (!usuario) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuário não encontrado' 
      });
    }

    const totalCursos = usuario.progressoCursos.length;
    const cursosConcluidos = usuario.progressoCursos.filter(p => p.progresso === 100).length;
    
    const progressoMedio = totalCursos > 0 
      ? Math.round(usuario.progressoCursos.reduce((sum, p) => sum + p.progresso, 0) / totalCursos)
      : 0;

    res.json({
      success: true,
      progressoGeral: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        totalCursos: totalCursos,
        cursosConcluidos: cursosConcluidos,
        progressoMedio: progressoMedio,
        cursos: usuario.progressoCursos.map(p => ({
          cursoId: p.cursoId,
          cursoTitulo: p.curso.titulo,
          progresso: p.progresso,
          ultimaAtualizacao: p.atualizadoEm
        })),
        ultimaAtualizacao: new Date().toISOString()
      }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar progresso geral');
  }
});

// ========== SISTEMA DE VÍDEOS ========== //

app.get('/api/videos', async (req, res) => {
  try {
    const videos = await prisma.video.findMany({ 
      orderBy: { materia: 'asc' } 
    });
    
    // Descriptografar URLs
    const videosComUrlsDescriptografadas = videos.map(video => ({
      ...video,
      url: encryptionService.decryptYouTubeUrl(video.url)
    }));
    
    res.json(videosComUrlsDescriptografadas);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar vídeos');
  }
});

// ✅ POST CRIAR VÍDEO (com criptografia)
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

    // Criptografar URL antes de salvar
    const encryptedUrl = encryptionService.encryptYouTubeUrl(url.trim());

    const novoVideo = await prisma.video.create({
      data: {
        titulo: titulo.trim(),
        materia: materia.trim(),
        categoria: categoria.trim(),
        url: encryptedUrl.encrypted, 
        iv: encryptedUrl.iv,
        tag: encryptedUrl.tag,
        descricao: descricao ? descricao.trim() : '',
        duracao: parseInt(duracao)
      }
    });

    res.status(201).json({
      success: true,
      message: 'Vídeo adicionado com sucesso!',
      video: {
        ...novoVideo,
        url: encryptionService.decryptYouTubeUrl({
          encrypted: novoVideo.url,
          iv: novoVideo.iv,
          tag: novoVideo.tag
        })
      }
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

    const videoExistente = await prisma.video.findUnique({ where: { id: videoId } });
    if (!videoExistente) return res.status(404).json({ error: 'Vídeo não encontrado' });

    const { titulo, materia, categoria, url, descricao, duracao } = req.body;
    const updateData = {};
    
    if (titulo !== undefined) updateData.titulo = titulo.trim();
    if (materia !== undefined) updateData.materia = materia.trim();
    if (categoria !== undefined) updateData.categoria = categoria.trim();
    if (url !== undefined) updateData.url = url.trim();
    if (descricao !== undefined) updateData.descricao = descricao.trim();
    if (duracao !== undefined) updateData.duracao = parseInt(duracao);

    const videoAtualizado = await prisma.video.update({
      where: { id: videoId },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Vídeo atualizado com sucesso!',
      video: videoAtualizado
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

    const videoExistente = await prisma.video.findUnique({ where: { id: videoId } });
    if (!videoExistente) return res.status(404).json({ error: 'Vídeo não encontrado' });

    await prisma.video.delete({ where: { id: videoId } });

    res.json({
      success: true,
      message: 'Vídeo excluído com sucesso!',
      videoId: videoId
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir vídeo');
  }
});

// ========== SISTEMA DE DESAFIOS ========== //

// ✅ GET TODOS OS DESAFIOS (ADMIN)
app.get('/api/desafios', async (req, res) => {
  try {
    console.log('🎯 Buscando todos os desafios...');
    
    const desafios = await prisma.desafio.findMany({
      include: {
        perguntas: {
          where: { ativo: true },
          orderBy: { ordem: 'asc' }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    console.log(`✅ ${desafios.length} desafios carregados`);
    
    res.json(desafios);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar desafios');
  }
});

// ✅ GET DESAFIO POR ID (ADMIN)
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
        }
      }
    });

    if (!desafio) {
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }

    res.json(desafio);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar desafio');
  }
});

// ✅ POST CRIAR DESAFIO (ADMIN)
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
      status, 
      maxTentativas,
      dataInicio,
      dataFim,
      perguntas 
    } = req.body;

    const requiredFields = ['titulo', 'pontuacao', 'materia', 'nivel', 'duracao'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        missingFields: missingFields,
        message: 'Campos obrigatórios faltando'
      });
    }

    if (!perguntas || !Array.isArray(perguntas) || perguntas.length < 3) {
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

    const novoDesafio = await prisma.$transaction(async (tx) => {
      const desafio = await tx.desafio.create({
        data: {
          titulo: titulo.trim(),
          pontuacao: parseInt(pontuacao),
          materia: materia.trim(),
          nivel: nivel.trim(),
          duracao: parseInt(duracao),
          descricao: descricao ? descricao.trim() : '',
          status: status || 'ativo',
          maxTentativas: maxTentativas ? parseInt(maxTentativas) : 1,
          dataInicio: dataInicio ? new Date(dataInicio) : null,
          dataFim: dataFim ? new Date(dataFim) : null,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        }
      });

      console.log(`✅ Desafio criado com ID: ${desafio.id}`);

      for (let i = 0; i < perguntas.length; i++) {
        const perguntaData = perguntas[i];
        
        await tx.perguntaDesafio.create({
          data: {
            pergunta: perguntaData.pergunta.trim(),
            alternativaA: perguntaData.alternativas[0].trim(),
            alternativaB: perguntaData.alternativas[1].trim(),
            alternativaC: perguntaData.alternativas[2].trim(),
            alternativaD: perguntaData.alternativas[3].trim(),
            correta: parseInt(perguntaData.correta),
            explicacao: perguntaData.explicacao ? perguntaData.explicacao.trim() : null,
            ordem: perguntaData.ordem || i + 1,
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

    res.status(201).json({
      success: true,
      message: 'Desafio criado com sucesso!',
      desafio: novoDesafio
    });

  } catch (error) {
    handleError(res, error, 'Erro ao criar desafio');
  }
});

// ✅ PUT ATUALIZAR DESAFIO (ADMIN)
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

      if (titulo !== undefined) updateData.titulo = titulo.trim();
      if (pontuacao !== undefined) updateData.pontuacao = parseInt(pontuacao);
      if (materia !== undefined) updateData.materia = materia.trim();
      if (nivel !== undefined) updateData.nivel = nivel.trim();
      if (duracao !== undefined) updateData.duracao = parseInt(duracao);
      if (descricao !== undefined) updateData.descricao = descricao.trim();
      if (status !== undefined) updateData.status = status;
      if (maxTentativas !== undefined) updateData.maxTentativas = parseInt(maxTentativas);
      if (dataInicio !== undefined) updateData.dataInicio = dataInicio ? new Date(dataInicio) : null;
      if (dataFim !== undefined) updateData.dataFim = dataFim ? new Date(dataFim) : null;

      const desafio = await tx.desafio.update({
        where: { id: desafioId },
        data: updateData
      });

      if (perguntas && Array.isArray(perguntas)) {
        await tx.perguntaDesafio.updateMany({
          where: { desafioId: desafioId },
          data: { ativo: false }
        });

        for (let i = 0; i < perguntas.length; i++) {
          const perguntaData = perguntas[i];
          
          await tx.perguntaDesafio.create({
            data: {
              pergunta: perguntaData.pergunta.trim(),
              alternativaA: perguntaData.alternativas[0].trim(),
              alternativaB: perguntaData.alternativas[1].trim(),
              alternativaC: perguntaData.alternativas[2].trim(),
              alternativaD: perguntaData.alternativas[3].trim(),
              correta: parseInt(perguntaData.correta),
              explicacao: perguntaData.explicacao ? perguntaData.explicacao.trim() : null,
              ordem: perguntaData.ordem || i + 1,
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

    res.json({
      success: true,
      message: 'Desafio atualizado com sucesso!',
      desafio: desafioAtualizado
    });

  } catch (error) {
    handleError(res, error, 'Erro ao atualizar desafio');
  }
});

// ✅ DELETE DESAFIO (ADMIN)
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
        status: 'inativo',
        atualizadoEm: new Date()
      }
    });

    console.log(`✅ Desafio excluído logicamente: ${desafioExistente.titulo}`);

    res.json({
      success: true,
      message: 'Desafio excluído com sucesso!',
      desafioId: desafioId
    });

  } catch (error) {
    handleError(res, error, 'Erro ao excluir desafio');
  }
});

// ========== SISTEMA DE DESAFIOS (USUÁRIO) ========== //

// ✅ GET DESAFIOS ATIVOS PARA USUÁRIOS
app.get('/api/desafios-ativos', async (req, res) => {
  try {
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
    
    res.json(desafios);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar desafios ativos');
  }
});

// ✅ GET PERGUNTAS DE UM DESAFIO PARA RESOLUÇÃO
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

    console.log(`📝 Verificando respostas do desafio ID: ${desafioId} para usuário: ${usuarioId}`);

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
      where: { id: parseInt(usuarioId) }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const agora = new Date();
    if (desafio.dataFim && new Date(desafio.dataFim) < agora) {
      return res.status(400).json({ 
        error: 'Desafio expirado',
        details: 'O prazo para realizar este desafio já terminou'
      });
    }

    let acertos = 0;
    const resultadoDetalhado = [];

    for (let i = 0; i < desafio.perguntas.length; i++) {
      const pergunta = desafio.perguntas[i];
      const respostaUsuario = respostas[i];
      
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
    
    let pontuacaoGanha = desafio.pontuacao;
    
    if (porcentagemAcerto < 50) {
      pontuacaoGanha = Math.floor(pontuacaoGanha * 0.5);
    } else if (porcentagemAcerto < 75) {
      pontuacaoGanha = Math.floor(pontuacaoGanha * 0.75);
    } else if (porcentagemAcerto < 90) {
      pontuacaoGanha = Math.floor(pontuacaoGanha * 0.9);
    }
    
    if (acertos === desafio.perguntas.length) {
      pontuacaoGanha += Math.floor(pontuacaoGanha * 0.2);
    }

    const novaPontuacao = usuario.pontuacao + pontuacaoGanha;
    const novosDesafios = usuario.desafiosCompletados + 1;

    const usuarioAtualizado = await prisma.usuario.update({
      where: { id: parseInt(usuarioId) },
      data: {
        pontuacao: novaPontuacao,
        desafiosCompletados: novosDesafios,
        atualizadoEm: new Date()
      }
    });

    try {
      await prisma.historicoDesafio.create({
        data: {
          usuarioId: parseInt(usuarioId),
          desafioId: desafioId,
          pontuacaoGanha: pontuacaoGanha,
          acertos: acertos,
          totalPerguntas: desafio.perguntas.length,
          porcentagemAcerto: porcentagemAcerto,
          dataConclusao: new Date()
        }
      });
    } catch (historyError) {
      console.warn('⚠️ Não foi possível salvar histórico:', historyError.message);
    }

    console.log(`✅ Desafio verificado: ${usuario.nome} acertou ${acertos}/${desafio.perguntas.length} (+${pontuacaoGanha} pontos)`);

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
      detalhes: resultadoDetalhado,
      usuario: {
        id: usuarioAtualizado.id,
        nome: usuarioAtualizado.nome,
        pontuacao: usuarioAtualizado.pontuacao,
        desafiosCompletados: usuarioAtualizado.desafiosCompletados
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

    const historico = await prisma.historicoDesafio.findMany({
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
      take: 60 
    });

    res.json({
      success: true,
      historico: historico
    });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar histórico de desafios');
  }
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
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// ========== CAPTURADOR DE ERROS GLOBAL ========== //
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:');
    console.error('Reason:', reason);
    process.exit(1);
});

// ========== INICIALIZAÇÃO DO SERVIDOR ========== //

async function startServer() {
    try {
        console.log('🚀 Iniciando servidor Coliseum API...');
        
        const dbConnected = await initializeDatabase();
        
        if (!dbConnected) {
            console.error('❌ Não foi possível conectar ao banco de dados. Encerrando...');
            process.exit(1);
        }
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n📍 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🌐 Production: https://coliseum-api.onrender.com`);
            console.log(`\n✨ API Coliseum totalmente operacional!`);
            console.log(`⏰ Iniciado em: ${new Date().toISOString()}`);
            console.log(`\n🎯 Funcionalidades disponíveis:`);
            console.log(`   👥 Sistema de Usuários`);
            console.log(`   🤝 Sistema de Amigos`);
            console.log(`   🎯 Sistema de Desafios`);
            console.log(`   📚 Sistema de Cursos`);
            console.log(`   📹 Sistema de Vídeos`);
            console.log(`   💬 Sistema de Chat`);
            console.log(`   📊 Sistema de Progresso`);
        });
        
        server.keepAliveTimeout = 120000;
        server.headersTimeout = 120000;
        
        const keepAliveInterval = setInterval(async () => {
          try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('🔄 Keep-alive: Conexão com banco mantida');
          } catch (error) {
            console.warn('⚠️ Keep-alive falhou, tentando reconectar...');
            try {
              await prisma.$disconnect();
              await prisma.$connect();
              console.log('✅ Conexão restabelecida via keep-alive');
            } catch (reconnectError) {
              console.error('❌ Falha ao reconectar no keep-alive:', reconnectError.message);
            }
          }
        }, 30000);
        
        server.on('close', () => {
          clearInterval(keepAliveInterval);
        });
        
        return server;
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        console.error('Stack:', error.stack);
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

// Inicia o servidor
startServer();












