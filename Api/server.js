import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import encryptionService from './services/encryption.service.js';
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
    maxWait: 30000, 
    timeout: 60000, 
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

// ========== CORS SIMPLIFICADO E FUNCIONAL ========== //
const allowedOrigins = [
    'https://coliseum-eaiewmqzt-icaroass-projects.vercel.app',
    'https://coliseum-app.vercel.app',
    'https://coliseum.vercel.app',
    'https://coliseum-adm.vercel.app',
    'https://coliseum-admin.vercel.app',
    'https://coliseum-api.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    console.log(`🌐 ${req.method} ${req.path} - Origin: ${origin || 'None'}`);
    
    // Permitir qualquer origem em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    // Em produção, verificar lista
    else if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    // Se não tiver origem (apps móveis, curl, etc)
    else if (!origin) {
        res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, usuarioId, x-user-id, X-API-Key');
    res.header('Access-Control-Expose-Headers', 'Content-Length, X-Keep-Alive, X-Request-Id, usuarioId, x-user-id, X-Total-Cursos');
    
    // Responder imediatamente para OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        console.log(`✅ Preflight OPTIONS atendido para: ${origin}`);
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========== MIDDLEWARE DE CRIPTOGRAFIA ========== //
app.use('/api/videos', encryptResponseMiddleware);
app.use('/api/videos', encryptRequestBodyMiddleware);
app.use('/api/aulas', encryptResponseMiddleware);
app.use('/api/aulas', encryptRequestBodyMiddleware);

// ========== MIDDLEWARE DE LOG E CONEXÃO ========== //
app.use(async (req, res, next) => {
  console.log(`\n=== NOVA REQUISIÇÃO ===`);
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  console.log('📍 Origin:', req.headers.origin || 'Sem origin');
    
  // Adicionar headers CORS em todas as respostas
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, usuarioId');
  
  // Para requisições OPTIONS, responder imediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
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
        success: false,
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
      success: false,
      error: 'Registro não encontrado',
      details: 'O item solicitado não existe ou já foi removido'
    });
  }
  
  if (error.code === 'P2002') {
    return res.status(409).json({ 
      success: false,
      error: 'Conflito de dados',
      details: 'Já existe um registro com esses dados únicos'
    });
  }

  if (error.code === 'P1001') {
    return res.status(503).json({ 
      success: false,
      error: 'Database não disponível',
      details: 'Não foi possível conectar ao banco de dados'
    });
  }
  
  if (error.code === 'P1017') {
    return res.status(503).json({ 
      success: false,
      error: 'Conexão com banco fechada',
      details: 'A conexão com o banco de dados foi fechada'
    });
  }
  
  res.status(500).json({ 
    success: false,
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
        console.log(`ℹ️ Sem restrições: cursoUsuario=${cursoUsuario}, materiaCurso=${materiaCurso}`);
        return true; 
    }
    
    const mapeamentoCursos = {
        'programacao': ['python', 'javascript', 'web', 'html', 'css', 'programacao', 'desenvolvimento'],
        'robotica': ['arduino', 'robotica', 'eletronica', 'automatizacao'],
        'games': ['unity', 'blender', 'game', 'games', 'pixelart', 'desenvolvimento de games'],
        'reforco': ['algebra', 'geometria', 'matematica', 'quimica', 'fisica', 'biologia', 'ciencias'],
        'preparatorio': ['historia', 'geografia', 'gramatica', 'redacao', 'literatura', 'portugues'],
        'informatica': ['word', 'excel', 'powerpoint', 'windows', 'pacote office', 'informatica basica'],
        'outros': [] 
    };
    
    const cursoUsuarioLower = cursoUsuario.toLowerCase().trim();
    const materiaCursoLower = materiaCurso.toLowerCase().trim();
    
    console.log(`📊 Valores normalizados: curso=${cursoUsuarioLower}, matéria=${materiaCursoLower}`);
    
    if (cursoUsuarioLower === 'admin' || cursoUsuarioLower === 'administrador') {
        console.log('👑 Usuário é admin, permitindo acesso total');
        return true;
    }
    
    if (materiaCursoLower === 'web' && cursoUsuarioLower === 'programacao') {
        console.log('✅ Acesso permitido: programação → web');
        return true;
    }
    
    let categoriaEncontrada = 'outros';
    
    // Procurar a matéria no mapeamento
    for (const [categoria, materias] of Object.entries(mapeamentoCursos)) {
        if (materias.some(materia => materiaCursoLower.includes(materia) || materia.includes(materiaCursoLower))) {
            categoriaEncontrada = categoria;
            break;
        }
    }
    
    console.log(`📋 Matéria "${materiaCurso}" pertence à categoria: "${categoriaEncontrada}"`);
  
    const temAcesso = cursoUsuarioLower === categoriaEncontrada || categoriaEncontrada === 'outros';
    
    console.log(`🔓 Resultado: ${cursoUsuario} → ${materiaCurso}: ${temAcesso ? 'PERMITIDO' : 'BLOQUEADO'}`);
    
    return temAcesso;
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
    const dbStatus = await prisma.$queryRaw`SELECT 1`;
    
    const [totalUsuarios, totalVideos, totalCursos, totalDesafios, totalAmizades, totalMensagensChat] = await Promise.all([
      prisma.usuario.count().catch(() => 0),
      prisma.video.count().catch(() => 0),
      prisma.curso.count().catch(() => 0),
      prisma.desafio.count().catch(() => 0),
      prisma.amizade.count().catch(() => 0),
      prisma.mensagemChat.count().catch(() => 0)
    ]);

    res.json({ 
      success: true,
      status: 'online',
      database: 'connected',
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
      success: false,
      status: 'error',
      database: 'disconnected',
      error: error.message,
      uptime: process.uptime()
    });
  }
});;

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

app.get('/api/usuarios/admins', async (req, res) => {
    try {
        const admins = await prisma.usuario.findMany({
            where: {
                OR: [
                    { curso: 'admin' },
                    { curso: 'administrador' },
                    { status: 'admin' }
                ]
            },
            select: {
                id: true,
                nome: true,
                ra: true,
                curso: true,
                status: true
            }
        });
        
        res.json({
            success: true,
            admins: admins,
            total: admins.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar admins:', error);
        res.json({
            success: false,
            admins: [],
            error: error.message
        });
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

// ✅ GET TODOS OS CURSOS
app.get('/api/cursos', async (req, res) => {
  try {
    console.log('📚 Buscando todos os cursos...');
    
    const { usuarioId, isAdmin, debug } = req.query;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;
    
    // ✅ CORREÇÃO: Se for admin OU não tiver usuarioId, retornar TODOS os cursos
    const isAdminMode = isAdmin === 'true' || isAdmin === true || !usuarioIdValidado;
    
    if (isAdminMode) {
      console.log('👑 Modo ADMIN ativado: retornando TODOS os cursos');
    } else {
      console.log(`👤 Modo USUÁRIO: filtrando para usuário ID: ${usuarioIdValidado}`);
    }
    
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

    console.log(`📊 Total de cursos no banco: ${cursos.length}`);
    
    if (!isAdminMode && usuarioIdValidado) {
      console.log('🔍 Aplicando filtro de permissão para usuário...');
      
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioIdValidado },
        select: { curso: true, nome: true, ra: true }
      });

      if (usuario) {
        const cursosAntes = cursos.length;
        cursos = cursos.filter(curso => 
          verificarPermissaoCurso(usuario.curso, curso.materia)
        );
        console.log(`✅ Cursos filtrados para ${usuario.nome} (${usuario.curso}): ${cursos.length} de ${cursosAntes} permitidos`);
        
        if (debug === 'true') {
          console.log('🔍 DEBUG - Cursos permitidos:');
          cursos.forEach((curso, i) => {
            console.log(`  ${i + 1}. ${curso.titulo} (${curso.materia})`);
          });
        }
      }
    } else {
      console.log('✅ Retornando todos os cursos (sem filtro)');
    }

    try {
      const respostaJSON = JSON.stringify(cursos);
      JSON.parse(respostaJSON); 
      
      console.log(`✅ ${cursos.length} cursos serão retornados`);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Expose-Headers', 'X-Total-Cursos');
      res.setHeader('X-Total-Cursos', cursos.length);
      res.send(respostaJSON);
      
    } catch (jsonError) {
      console.error('❌ ERRO: JSON inválido!');
      console.error('Erro:', jsonError.message);
      
      res.status(200).json([]);
    }
    
  } catch (error) {
    console.error('❌ Erro ao carregar cursos:', error);
    
    res.status(200).json({
      success: false,
      error: 'Erro ao carregar cursos',
      cursos: [] 
    });
  }
});

// ✅ GET CURSO POR ID
app.get('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ 
        success: false,
        error: 'ID do curso inválido' 
      });
    }

    const usuarioId = req.headers['usuarioid'] || req.query.usuarioId;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;

    console.log(`🎯 Buscando curso ID: ${cursoId} para usuário: ${usuarioIdValidado || 'Não especificado'}`);

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

    if (usuarioIdValidado) {
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioIdValidado },
        select: { curso: true, nome: true }
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

      const cursoComProgresso = {
        ...curso,
        modulos: modulosComProgresso,
        progresso: progressoCurso?.progresso || 0
      };

      res.json({
        success: true,
        curso: cursoComProgresso
      });

    } else {
      res.json({
        success: true,
        curso: curso
      });
    }

  } catch (error) {
    console.error('❌ Erro ao carregar curso:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar curso',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
  }
});

// ✅ GET MÓDULOS DE UM CURSO
app.get('/api/cursos/:id/modulos', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ 
        success: false,
        error: 'ID do curso inválido' 
      });
    }

    const usuarioId = req.headers['usuarioid'] || req.query.usuarioId;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;

    console.log(`📚 Buscando módulos do curso ${cursoId} para usuário: ${usuarioIdValidado || 'Não especificado'}`);

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
    console.error('❌ Erro ao carregar módulos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar módulos',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
  }
});

// ✅ POST CRIAR CURSO (NOVO)
// ✅ POST CRIAR CURSO (NOVO - CORRIGIDO)
app.post('/api/cursos', async (req, res) => {
  try {
    console.log('📝 Recebendo requisição POST /api/cursos');
    console.log('📦 Body recebido:', {
      titulo: req.body.titulo ? req.body.titulo.substring(0, 50) : 'N/A',
      materia: req.body.materia || 'N/A',
      categoria: req.body.categoria || 'N/A',
      nivel: req.body.nivel || 'N/A',
      totalModulos: req.body.modulos ? req.body.modulos.length : 0
    });

    const { 
      titulo, 
      descricao, 
      materia, 
      categoria, 
      nivel, 
      duracao, 
      imagem, 
      ativo = true,
      modulos 
    } = req.body;

    // VALIDAÇÃO BÁSICA (mantenha igual)

    console.log('✅ Validação passada. Criando curso...');

    // CRIAR CURSO COM MÓDULOS E AULAS EM TRANSACTION SEPARADAS
    try {
      // 1. Criar curso (transação separada)
      const curso = await prisma.curso.create({
        data: {
          titulo: titulo.trim(),
          descricao: descricao ? descricao.trim() : '',
          materia: materia.trim(),
          categoria: categoria.trim(),
          nivel: nivel.trim(),
          duracao: parseInt(duracao),
          imagem: imagem ? imagem.trim() : null,
          ativo: ativo,
          criadoEm: new Date(),
          atualizadoEm: new Date()
        }
      });

      console.log(`✅ Curso criado: ${curso.titulo} (ID: ${curso.id})`);

      // 2. Criar módulos (sem transaction para evitar timeout)
      const modulosCriados = [];
      
      for (let i = 0; i < modulos.length; i++) {
        const moduloData = modulos[i];
        
        try {
          const novoModulo = await prisma.modulo.create({
            data: {
              titulo: moduloData.titulo.trim(),
              descricao: moduloData.descricao ? moduloData.descricao.trim() : '',
              ordem: moduloData.ordem || (i + 1),
              cursoId: curso.id,
              ativo: true,
              criadoEm: new Date(),
              atualizadoEm: new Date()
            }
          });

          console.log(`✅ Módulo criado: ${novoModulo.titulo} (ID: ${novoModulo.id})`);
          modulosCriados.push(novoModulo);

          // 3. Criar aulas para este módulo (lote pequeno)
          if (moduloData.aulas && Array.isArray(moduloData.aulas)) {
            const aulasParaCriar = [];
            
            for (let j = 0; j < moduloData.aulas.length; j++) {
              const aulaData = moduloData.aulas[j];
              
              aulasParaCriar.push({
                titulo: aulaData.titulo.trim(),
                descricao: aulaData.descricao ? aulaData.descricao.trim() : '',
                conteudo: aulaData.conteudo ? aulaData.conteudo.trim() : '',
                duracao: parseInt(aulaData.duracao) || 15,
                ordem: aulaData.ordem || (j + 1),
                moduloId: novoModulo.id,
                videoUrl: aulaData.videoUrl ? aulaData.videoUrl.trim() : null,
                ativo: true,
                criadoEm: new Date(),
                atualizadoEm: new Date()
              });

              // Criar em lotes de 5 para evitar problemas
              if (aulasParaCriar.length >= 5 || j === moduloData.aulas.length - 1) {
                await prisma.aula.createMany({
                  data: aulasParaCriar
                });
                console.log(`✅ ${aulasParaCriar.length} aulas criadas em lote para módulo ${novoModulo.titulo}`);
                aulasParaCriar.length = 0; // Limpar array
              }
            }
          }
          
          // Pequena pausa entre módulos para evitar sobrecarga
          if (i < modulos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (moduloError) {
          console.error(`❌ Erro ao criar módulo ${i + 1}:`, moduloError.message);
          // Continuar com os outros módulos
        }
      }

      // 4. Buscar curso completo
      const cursoCompleto = await prisma.curso.findUnique({
        where: { id: curso.id },
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

      console.log(`🎉 Curso criado com sucesso! ID: ${curso.id}`);
      console.log(`📊 Módulos criados: ${modulosCriados.length}`);
      console.log(`📊 Total de aulas: ${cursoCompleto?.modulos?.reduce((sum, mod) => sum + (mod.aulas?.length || 0), 0) || 0}`);

      res.status(201).json({
        success: true,
        message: 'Curso criado com sucesso!',
        curso: cursoCompleto
      });

    } catch (transactionError) {
      console.error('❌ Erro na criação do curso:', transactionError);
      throw transactionError;
    }

  } catch (error) {
    console.error('❌ Erro ao criar curso:', error);
    
    // Tentar rollback manual se possível
    if (error.code === 'P2028') {
      console.log('⚠️ Transação expirada - tentando recuperar...');
    }
    
    res.status(500).json({
      success: false,
      error: 'Erro ao criar curso',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
      code: error.code
    });
  }
});
// ✅ PUT EDITAR CURSO (CORRIGIDO)
app.put('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) return res.status(400).json({ 
      success: false,
      error: 'ID do curso inválido' 
    });

    console.log(`✏️ EDITANDO curso ID: ${cursoId}`);
    console.log('📦 Body recebido:', {
      titulo: req.body.titulo ? req.body.titulo.substring(0, 50) : 'N/A',
      materia: req.body.materia || 'N/A',
      categoria: req.body.categoria || 'N/A',
      nivel: req.body.nivel || 'N/A',
      totalModulos: req.body.modulos ? req.body.modulos.length : 0
    });

    // DEBUG: Mostrar estrutura completa dos módulos
    if (req.body.modulos && Array.isArray(req.body.modulos)) {
      console.log('📚 Estrutura dos módulos recebidos:');
      req.body.modulos.forEach((modulo, i) => {
        console.log(`  Módulo ${i + 1}: "${modulo.titulo}" (${modulo.aulas?.length || 0} aulas)`);
        if (modulo.aulas) {
          modulo.aulas.forEach((aula, j) => {
            console.log(`    Aula ${j + 1}: "${aula.titulo}" (${aula.duracao || 0}min)`);
          });
        }
      });
    }

    const { 
      titulo, 
      descricao, 
      materia, 
      categoria, 
      nivel, 
      duracao, 
      imagem, 
      ativo = true,
      modulos 
    } = req.body;

    // VALIDAÇÃO BÁSICA
    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Título obrigatório',
        details: 'O curso precisa de um título'
      });
    }

    if (!materia || materia.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Matéria obrigatória',
        details: 'Selecione a matéria do curso'
      });
    }

    if (!categoria || categoria.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Categoria obrigatória',
        details: 'Selecione a categoria do curso'
      });
    }

    if (!nivel || nivel.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Nível obrigatório',
        details: 'Selecione o nível do curso'
      });
    }

    if (!duracao || parseInt(duracao) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Duração inválida',
        details: 'A duração deve ser maior que zero'
      });
    }

    if (!modulos || !Array.isArray(modulos) || modulos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Módulos obrigatórios',
        details: 'O curso deve ter pelo menos um módulo'
      });
    }

    // Verificar se o curso existe
    const cursoExistente = await prisma.curso.findUnique({ 
      where: { id: cursoId },
      include: {
        modulos: {
          include: {
            aulas: true
          }
        }
      }
    });
    
    if (!cursoExistente) {
      return res.status(404).json({ 
        success: false,
        error: 'Curso não encontrado' 
      });
    }

    // VALIDAR CADA MÓDULO
    for (let i = 0; i < modulos.length; i++) {
      const modulo = modulos[i];
      
      if (!modulo.titulo || modulo.titulo.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Módulo sem título',
          details: `O módulo ${i + 1} precisa de um título`
        });
      }

      if (!modulo.aulas || !Array.isArray(modulo.aulas) || modulo.aulas.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Módulo sem aulas',
          details: `O módulo "${modulo.titulo}" deve ter pelo menos uma aula`
        });
      }

      // Validar cada aula
      for (let j = 0; j < modulo.aulas.length; j++) {
        const aula = modulo.aulas[j];
        
        if (!aula.titulo || aula.titulo.trim() === '') {
          return res.status(400).json({
            success: false,
            error: 'Aula sem título',
            details: `Aula ${j + 1} do módulo "${modulo.titulo}" precisa de um título`
          });
        }

        if (!aula.duracao || parseInt(aula.duracao) <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Duração inválida',
            details: `Aula "${aula.titulo}" deve ter uma duração válida`
          });
        }
      }
    }

    console.log('✅ Validação passada. Atualizando curso...');

    // ATUALIZAR CURSO COM MÓDULOS E AULAS (USANDO TRANSACTION)
    const cursoAtualizado = await prisma.$transaction(async (tx) => {
      // 1. Atualizar informações básicas do curso
      const dadosAtualizacao = {
        titulo: titulo.trim(),
        descricao: descricao ? descricao.trim() : '',
        materia: materia.trim(),
        categoria: categoria.trim(),
        nivel: nivel.trim(),
        duracao: parseInt(duracao),
        imagem: imagem ? imagem.trim() : cursoExistente.imagem,
        ativo: ativo,
        atualizadoEm: new Date()
      };

      console.log('📝 Dados do curso para atualização:', dadosAtualizacao);

      const curso = await tx.curso.update({
        where: { id: cursoId },
        data: dadosAtualizacao
      });

      console.log(`✅ Curso base atualizado: ${curso.titulo} (ID: ${curso.id})`);

      // 2. OBTER IDs dos módulos existentes
      const modulosExistentes = await tx.modulo.findMany({
        where: { cursoId: cursoId },
        select: { id: true }
      });

      const moduloIdsExistentes = modulosExistentes.map(m => m.id);
      
      // 3. DELETAR TODAS AS AULAS DOS MÓDULOS EXISTENTES
      if (moduloIdsExistentes.length > 0) {
        console.log(`🗑️ Deletando ${moduloIdsExistentes.length} módulos antigos...`);
        await tx.aula.deleteMany({
          where: { moduloId: { in: moduloIdsExistentes } }
        });
        
        // Deletar os módulos
        await tx.modulo.deleteMany({
          where: { id: { in: moduloIdsExistentes } }
        });
      }

      // 4. CRIAR NOVOS MÓDULOS E AULAS
      console.log(`🔄 Criando ${modulos.length} novos módulos...`);
      
      for (let i = 0; i < modulos.length; i++) {
        const moduloData = modulos[i];
        
        const novoModulo = await tx.modulo.create({
          data: {
            titulo: moduloData.titulo.trim(),
            descricao: moduloData.descricao ? moduloData.descricao.trim() : '',
            ordem: moduloData.ordem || (i + 1),
            cursoId: curso.id,
            ativo: true,
            criadoEm: new Date(),
            atualizadoEm: new Date()
          }
        });

        console.log(`✅ Módulo criado: ${novoModulo.titulo} (ID: ${novoModulo.id})`);

        // Criar aulas do módulo
        if (moduloData.aulas && Array.isArray(moduloData.aulas)) {
          console.log(`📝 Criando ${moduloData.aulas.length} aulas para o módulo...`);
          
          for (let j = 0; j < moduloData.aulas.length; j++) {
            const aulaData = moduloData.aulas[j];
            
            await tx.aula.create({
              data: {
                titulo: aulaData.titulo.trim(),
                descricao: aulaData.descricao ? aulaData.descricao.trim() : '',
                conteudo: aulaData.conteudo ? aulaData.conteudo.trim() : '',
                duracao: parseInt(aulaData.duracao) || 15,
                ordem: aulaData.ordem || (j + 1),
                moduloId: novoModulo.id,
                videoUrl: aulaData.videoUrl ? aulaData.videoUrl.trim() : null,
                ativo: true,
                criadoEm: new Date(),
                atualizadoEm: new Date()
              }
            });
          }
          console.log(`✅ ${moduloData.aulas.length} aulas criadas para módulo ${novoModulo.titulo}`);
        }
      }

      // 5. Retornar curso completo atualizado
      const cursoCompleto = await tx.curso.findUnique({
        where: { id: cursoId },
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

      console.log(`🎉 Curso editado com sucesso! ID: ${cursoCompleto.id}`);
      console.log(`📊 Módulos ativos: ${cursoCompleto.modulos?.length || 0}`);
      
      const totalAulas = cursoCompleto.modulos?.reduce((sum, mod) => sum + (mod.aulas?.length || 0), 0) || 0;
      console.log(`📊 Total de aulas: ${totalAulas}`);

      return cursoCompleto;
    });

    res.json({
      success: true,
      message: 'Curso atualizado com sucesso!',
      curso: cursoAtualizado
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar curso:', error);
    console.error('Stack trace:', error.stack);
    
    let errorMessage = 'Erro ao atualizar curso';
    let statusCode = 500;
    
    if (error.code === 'P2025') {
      errorMessage = 'Curso não encontrado';
      statusCode = 404;
    } else if (error.code === 'P2002') {
      errorMessage = 'Já existe um curso com este título';
      statusCode = 409;
    } else if (error.code === 'P2003') {
      errorMessage = 'Erro de referência no banco de dados';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
      code: error.code
    });
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

// ✅ GET AULA ESPECÍFICA
app.get('/api/aulas/:id', async (req, res) => {
  try {
    const aulaId = validateId(req.params.id);
    if (!aulaId) {
      return res.status(400).json({ 
        success: false,
        error: 'ID da aula inválido' 
      });
    }

    const usuarioId = req.headers['usuarioid'] || req.query.usuarioId;
    const usuarioIdValidado = usuarioId ? validateId(usuarioId) : null;

    console.log(`🎓 Buscando aula ${aulaId} para usuário: ${usuarioIdValidado || 'Não especificado'}`);

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

      res.json({
      success: true,
      aula: aulaDescriptografada
    });
  } catch (error) {
    console.error('❌ Erro ao carregar aula:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar aula',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
  }
});

// ========== SISTEMA DE PROGRESSO ========== //

// ✅ POST SALVAR PROGRESSO - COM VALIDAÇÃO
app.post('/api/progresso/aula', async (req, res) => {
    try {
        const { usuarioId, aulaId, concluida } = req.body;

        if (!usuarioId || !aulaId) {
            return res.status(400).json({ 
                success: false,
                error: 'Dados incompletos',
                details: 'Forneça usuarioId e aulaId'
            });
        }

        console.log(`📊 Salvando progresso - Usuário: ${usuarioId}, Aula: ${aulaId}`);

        // 1. Verificar usuário
        const usuario = await prisma.usuario.findUnique({
            where: { id: parseInt(usuarioId) }
        });

        if (!usuario) {
            return res.status(404).json({ 
                success: false,
                error: 'Usuário não encontrado' 
            });
        }

        // 2. Verificar aula
        const aula = await prisma.aula.findUnique({
            where: { id: parseInt(aulaId) },
            include: {
                modulo: {
                    include: {
                        curso: true
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

        // 3. Verificar permissão do curso
        if (!verificarPermissaoCurso(usuario.curso, aula.modulo.curso.materia)) {
            return res.status(403).json({
                success: false,
                error: 'Acesso negado',
                details: `Seu curso (${usuario.curso}) não tem acesso a ${aula.modulo.curso.materia}`
            });
        }

        // 4. Verificar autorização (se não for admin)
        if (usuario.curso !== 'admin') {
            const autorizada = await verificarAutorizacaoAula(
                parseInt(usuarioId),
                aula.modulo.curso.id,
                parseInt(aulaId)
            );
            
            if (!autorizada.autorizada && !concluida) {
                return res.status(403).json({
                    success: false,
                    error: 'Aula não autorizada',
                    details: 'Você precisa de autorização para acessar esta aula'
                });
            }
        }

        const progressoExistente = await prisma.progressoAula.findFirst({
            where: {
                usuarioId: parseInt(usuarioId),
                aulaId: parseInt(aulaId)
            }
        });

        let progresso;

        if (progressoExistente) {
            progresso = await prisma.progressoAula.update({
                where: { id: progressoExistente.id },
                data: {
                    concluida: concluida !== undefined ? concluida : true,
                    dataConclusao: concluida !== false ? new Date() : null,
                    atualizadoEm: new Date()
                }
            });
        } else {
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

        if (aula.modulo && concluida !== false) {
            await atualizarProgressoModulo(parseInt(usuarioId), aula.modulo.id);
            
            // Solicitação automática para próxima aula
            if (concluida === true) {
                setTimeout(async () => {
                    try {
                        const response = await fetch(`${req.protocol}://${req.get('host')}/api/solicitacoes/automatica`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                usuarioId: parseInt(usuarioId),
                                cursoId: aula.modulo.curso.id,
                                aulaConcluidaId: parseInt(aulaId)
                            })
                        });
                        
                        if (response.ok) {
                            console.log('🚀 Solicitação automática criada');
                        }
                    } catch (error) {
                        console.warn('⚠️ Não foi possível criar solicitação automática:', error.message);
                    }
                }, 1000);
            }
        }

        res.json({
            success: true,
            message: 'Progresso salvo com sucesso!',
            progresso: progresso
        });

    } catch (error) {
        console.error('❌ Erro ao salvar progresso:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao salvar progresso',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
        });
    }
});

// ✅ FUNÇÃO AUXILIAR PARA VERIFICAR AUTORIZAÇÃO
async function verificarAutorizacaoAula(usuarioId, cursoId, aulaId) {
    try {
        // 1. Verificar se já está concluída (permite revisão)
        const progresso = await prisma.progressoAula.findFirst({
            where: {
                usuarioId: usuarioId,
                aulaId: aulaId,
                concluida: true
            }
        });
        
        if (progresso) {
            return { autorizada: true, motivo: 'Aula já concluída' };
        }
        
        // 2. Buscar aula para obter módulo
        const aula = await prisma.aula.findUnique({
            where: { id: aulaId },
            select: { moduloId: true }
        });
        
        if (!aula) {
            return { autorizada: false, motivo: 'Aula não encontrada' };
        }
        
        // 3. Verificar autorizações ativas
        const autorizacoes = await prisma.autorizacaoAula.findMany({
            where: {
                usuarioId: usuarioId,
                cursoId: cursoId,
                ativo: true,
                OR: [
                    { dataExpiracao: null },
                    { dataExpiracao: { gt: new Date() } }
                ]
            }
        });
        
        for (const auth of autorizacoes) {
            if (auth.tipo === 'liberar_todas') {
                return { autorizada: true, motivo: 'Curso totalmente liberado' };
            }
            
            if (auth.tipo === 'liberar_modulo' && auth.moduloId === aula.moduloId) {
                return { autorizada: true, motivo: 'Módulo liberado' };
            }
            
            if (auth.tipo === 'liberar_aula' && auth.aulaId === aulaId) {
                return { autorizada: true, motivo: 'Aula específica liberada' };
            }
        }
        
        return { autorizada: false, motivo: 'Sem autorização' };
        
    } catch (error) {
        console.error('❌ Erro ao verificar autorização:', error);
        return { autorizada: false, motivo: 'Erro ao verificar' };
    }
}

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

// ========== FUNÇÕES AUXILIARES ========== //

function formatarRespostaErro(res, status, mensagem, detalhes = null) {
  return res.status(status).json({
    success: false,
    error: mensagem,
    details: detalhes
  });
}
function handlePrismaError(res, error) {
    console.error('❌ Erro no Prisma:', error);
    
    // Erros comuns do Prisma
    if (error.code === 'P2025') {
        return formatarRespostaErro(res, 404, 'Registro não encontrado');
    }
    
    if (error.code === 'P2002') {
        return formatarRespostaErro(res, 409, 'Registro já existe', {
            campo: error.meta?.target?.[0]
        });
    }
    
    if (error.code === 'P2003') {
        return formatarRespostaErro(res, 400, 'Referência inválida');
    }
    
    // Erro genérico
    return formatarRespostaErro(res, 500, 'Erro interno do servidor', 
        process.env.NODE_ENV === 'development' ? error.message : undefined
    );
}

function formatarRespostaSucesso(res, data, mensagem = 'Operação realizada com sucesso', status = 200) {
    return res.status(status).json({
        success: true,
        message: mensagem,
        ...data
    });
}

function validarDataExpiracao(dataString) {
    if (!dataString) return null;
    
    let data = new Date(dataString);
    
    if (isNaN(data.getTime())) {
        const partes = dataString.split('/');
        if (partes.length === 3) {
            data = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T00:00:00`);
        }
        
        if (isNaN(data.getTime())) {
            throw new Error('Data de expiração inválida. Use formato ISO (YYYY-MM-DD) ou DD/MM/YYYY');
        }
    }
    
    const agora = new Date();
    agora.setHours(0, 0, 0, 0); 
    
    if (data < agora) {
        throw new Error('Data de expiração não pode ser no passado');
    }
    
    return data;
}
// ========== SISTEMA DE AUTORIZAÇÃO ========== //

// ✅ 1. VERIFICAR AUTORIZAÇÃO DE UMA AULA (FRONTEND)
app.get('/api/autorizacoes/verificar/:usuarioId/:cursoId/:aulaId', async (req, res) => {
    try {
        const usuarioId = validateId(req.params.usuarioId);
        const cursoId = validateId(req.params.cursoId);
        const aulaId = validateId(req.params.aulaId);
        
        if (!usuarioId || !cursoId || !aulaId) {
            return res.status(400).json({
                success: false,
                autorizada: false,
                error: 'Parâmetros inválidos'
            });
        }
        
        console.log(`🔍 Verificando autorização - Usuário:${usuarioId}, Curso:${cursoId}, Aula:${aulaId}`);
        
        // 1. Verificar se já está concluída (permite revisão)
        const progresso = await prisma.progressoAula.findFirst({
            where: {
                usuarioId: usuarioId,
                aulaId: aulaId,
                concluida: true
            }
        });
        
        if (progresso) {
            return res.json({
                success: true,
                autorizada: true,
                motivo: 'Aula já concluída',
                permiteRevisao: true
            });
        }
        
        // 2. Buscar aula para obter módulo
        const aula = await prisma.aula.findUnique({
            where: { id: aulaId },
            select: { moduloId: true }
        });
        
        if (!aula) {
            return res.json({
                success: true,
                autorizada: false,
                motivo: 'Aula não encontrada'
            });
        }
        
        // 3. Verificar autorizações ativas
        const autorizacoes = await prisma.autorizacaoAula.findMany({
            where: {
                usuarioId: usuarioId,
                cursoId: cursoId,
                ativo: true,
                OR: [
                    { dataExpiracao: null },
                    { dataExpiracao: { gt: new Date() } }
                ]
            }
        });
        
        let autorizada = false;
        let motivo = 'Sem autorização';
        
        for (const auth of autorizacoes) {
            if (auth.tipo === 'liberar_todas') {
                autorizada = true;
                motivo = 'Curso totalmente liberado';
                break;
            }
            
            if (auth.tipo === 'liberar_modulo' && auth.moduloId === aula.moduloId) {
                autorizada = true;
                motivo = 'Módulo liberado';
                break;
            }
            
            if (auth.tipo === 'liberar_aula' && auth.aulaId === aulaId) {
                autorizada = true;
                motivo = 'Aula específica liberada';
                break;
            }
        }
        
        console.log(`📊 Resultado: ${autorizada ? '✅ AUTORIZADA' : '❌ NÃO AUTORIZADA'}`);
        
        res.json({
            success: true,
            autorizada: autorizada,
            motivo: motivo,
            detalhes: {
                totalAutorizacoes: autorizacoes.length,
                temLiberacaoTotal: autorizacoes.some(a => a.tipo === 'liberar_todas'),
                temLiberacaoModulo: autorizacoes.some(a => a.tipo === 'liberar_modulo' && a.moduloId === aula.moduloId),
                temLiberacaoAula: autorizacoes.some(a => a.tipo === 'liberar_aula' && a.aulaId === aulaId)
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar autorização:', error);
        res.status(500).json({
            success: false,
            autorizada: false,
            error: 'Erro ao verificar autorização'
        });
    }
});

// ✅ 2. LISTAR AUTORIZAÇÕES DE UM USUÁRIO PARA UM CURSO (FRONTEND)
app.get('/api/autorizacoes/curso/:cursoId/usuario/:usuarioId', async (req, res) => {
    try {
        const cursoId = validateId(req.params.cursoId);
        const usuarioId = validateId(req.params.usuarioId);
        
        if (!cursoId || !usuarioId) {
            return res.status(400).json({
                success: false,
                error: 'IDs inválidos'
            });
        }
        
        console.log(`🔍 Buscando autorizações - Usuário:${usuarioId}, Curso:${cursoId}`);
        
        const autorizacoes = await prisma.autorizacaoAula.findMany({
            where: {
                usuarioId: usuarioId,
                cursoId: cursoId,
                ativo: true,
                OR: [
                    { dataExpiracao: null },
                    { dataExpiracao: { gt: new Date() } }
                ]
            },
            include: {
                aula: {
                    select: { id: true, titulo: true, moduloId: true }
                },
                modulo: {
                    select: { id: true, titulo: true }
                }
            },
            orderBy: { criadoEm: 'desc' }
        });
        
        res.json({
            success: true,
            autorizacoes: autorizacoes,
            total: autorizacoes.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar autorizações:', error);
        handleError(res, error, 'Erro ao buscar autorizações');
    }
});

// ✅ VERSÃO SIMPLIFICADA DE AUTORIZAÇÕES
// ✅ CORREÇÃO: Verificar se adminId existe ANTES de criar
app.post('/api/autorizacoes', async (req, res) => {
    console.log('🔐 POST /api/autorizacoes - INÍCIO');
    console.log('📦 Body recebido:', req.body);
    
    try {
        const { tipo, usuarioId, cursoId, aulaId, adminId, motivo } = req.body;
        
        // 1. VALIDAÇÃO BÁSICA
        if (!tipo || !usuarioId || !cursoId || !adminId) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios faltando'
            });
        }
        
        console.log(`📝 Criando autorização: ${tipo} para usuário ${usuarioId} pelo admin ${adminId}`);
        
        // 2. VERIFICAR SE O ADMIN EXISTE
        console.log(`🔍 Verificando admin ID: ${adminId}`);
        const admin = await prisma.usuario.findUnique({
            where: { id: parseInt(adminId) }
        });
        
        if (!admin) {
            console.log(`❌ ERRO: Admin ID ${adminId} não encontrado!`);
            
            // Buscar sugestões de admins
            const possiveisAdmins = await prisma.usuario.findMany({
                take: 5,
                where: {
                    OR: [
                        { curso: { contains: 'admin', mode: 'insensitive' } },
                        { nome: { contains: 'admin', mode: 'insensitive' } }
                    ]
                },
                select: { id: true, nome: true, curso: true }
            });
            
            return res.status(404).json({
                success: false,
                error: 'Administrador não encontrado',
                details: `Nenhum usuário com ID ${adminId} existe no banco de dados`,
                suggestions: possiveisAdmins.length > 0 ? {
                    message: 'Possíveis administradores no sistema:',
                    admins: possiveisAdmins
                } : null
            });
        }
        
        console.log(`✅ Admin válido: ${admin.nome} (ID: ${admin.id})`);
        
        // 3. VERIFICAR SE O USUÁRIO EXISTE
        const usuario = await prisma.usuario.findUnique({
            where: { id: parseInt(usuarioId) }
        });
        
        if (!usuario) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado',
                details: `ID ${usuarioId} não existe`
            });
        }
        
        // 4. CRIAR AUTORIZAÇÃO
        console.log('💾 Salvando autorização no banco...');
        
        const autorizacao = await prisma.autorizacaoAula.create({
            data: {
                tipo: tipo,
                usuarioId: parseInt(usuarioId),
                cursoId: parseInt(cursoId),
                aulaId: aulaId ? parseInt(aulaId) : null,
                motivo: motivo || `Autorização ${tipo} concedida por ${admin.nome}`,
                adminId: parseInt(adminId),
                ativo: true,
                criadoEm: new Date(),
                atualizadoEm: new Date()
            }
        });
        
        console.log(`✅ AUTORIZAÇÃO CRIADA: ID ${autorizacao.id}`);
        
        res.status(201).json({
            success: true,
            message: 'Autorização criada com sucesso!',
            autorizacao: {
                id: autorizacao.id,
                tipo: autorizacao.tipo,
                usuarioId: autorizacao.usuarioId,
                cursoId: autorizacao.cursoId,
                adminId: autorizacao.adminId,
                criadoEm: autorizacao.criadoEm
            }
        });
        
    } catch (error) {
        console.error('💥 ERRO EM /api/autorizacoes:', error.message);
        console.error('Código:', error.code);
        
        if (error.code === 'P2003') {
            const field = error.meta?.field_name || 'desconhecido';
            console.log(`🔍 Campo com problema: ${field}`);
            
            return res.status(400).json({
                success: false,
                error: 'Erro de referência',
                details: `O ID fornecido para ${field} não existe no banco de dados`,
                field: field,
                code: error.code
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Erro ao criar autorização',
            details: error.message
        });
    }
});

// ✅ 4. CRIAR AUTORIZAÇÃO EM MASSA (ADMIN)
app.post('/api/autorizacoes/massa', async (req, res) => {
    try {
        console.log('👥 Recebendo autorização em massa...');
        
        const {
            tipo,
            cursoId,
            usuarioIds,
            aulaId,
            moduloId,
            motivo,
            dataExpiracao,
            adminId,
            notificarUsuarios = false,
            observacao
        } = req.body;
        
        if (!tipo || !cursoId || !usuarioIds || !Array.isArray(usuarioIds) || !adminId) {
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos',
                details: 'Forneça tipo, cursoId, usuarioIds (array) e adminId'
            });
        }
        
        if (usuarioIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum usuário selecionado'
            });
        }
        
        console.log(`📋 Autorização em massa: ${tipo} para ${usuarioIds.length} usuários`);
        
        const autorizacoesCriadas = [];
        const erros = [];
        
        for (const usuarioId of usuarioIds) {
            try {
                // Verificar se já existe autorização ativa
                const autorizacaoExistente = await prisma.autorizacaoAula.findFirst({
                    where: {
                        usuarioId: usuarioId,
                        cursoId: cursoId,
                        aulaId: aulaId || null,
                        moduloId: moduloId || null,
                        tipo: tipo,
                        ativo: true,
                        OR: [
                            { dataExpiracao: null },
                            { dataExpiracao: { gt: new Date() } }
                        ]
                    }
                });
                
                if (autorizacaoExistente) {
                    erros.push({
                        usuarioId,
                        erro: 'Autorização já existe',
                        autorizacaoId: autorizacaoExistente.id
                    });
                    continue;
                }
                
                const autorizacao = await prisma.autorizacaoAula.create({
                    data: {
                        tipo: tipo,
                        usuarioId: usuarioId,
                        cursoId: cursoId,
                        aulaId: aulaId || null,
                        moduloId: moduloId || null,
                        motivo: motivo || `Autorização em massa: ${tipo}`,
                        dataExpiracao: dataExpiracao ? new Date(dataExpiracao) : null,
                        adminId: adminId,
                        ativo: true,
                        criadoEm: new Date(),
                        atualizadoEm: new Date()
                    },
                    include: {
                        usuario: {
                            select: { id: true, nome: true, ra: true }
                        }
                    }
                });
                
                autorizacoesCriadas.push(autorizacao);
                console.log(`✅ Autorização criada para usuário ${usuarioId}`);
                
            } catch (error) {
                console.error(`❌ Erro para usuário ${usuarioId}:`, error.message);
                erros.push({
                    usuarioId,
                    erro: error.message
                });
            }
        }
        
        res.json({
            success: true,
            message: `Autorização em massa concluída!`,
            resultado: {
                processados: autorizacoesCriadas.length,
                erros: erros.length,
                totalUsuarios: usuarioIds.length
            },
            autorizacoes: autorizacoesCriadas.slice(0, 10),
            erros: erros
        });
        
    } catch (error) {
        console.error('❌ Erro na autorização em massa:', error);
        handleError(res, error, 'Erro na autorização em massa');
    }
});

// ✅ 5. DESATIVAR AUTORIZAÇÃO (ADMIN)
app.put('/api/autorizacoes/:id/desativar', async (req, res) => {
    try {
        const autorizacaoId = validateId(req.params.id);
        const { adminId, motivo } = req.body;
        
        if (!autorizacaoId || !adminId) {
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos'
            });
        }
        
        console.log(`🚫 Desativando autorização: ${autorizacaoId} pelo admin: ${adminId}`);
        
        const autorizacao = await prisma.autorizacaoAula.findUnique({
            where: { id: autorizacaoId }
        });
        
        if (!autorizacao) {
            return res.status(404).json({
                success: false,
                error: 'Autorização não encontrada'
            });
        }
        
        const autorizacaoAtualizada = await prisma.autorizacaoAula.update({
            where: { id: autorizacaoId },
            data: {
                ativo: false,
                motivo: motivo ? `${autorizacao.motivo || ''} | Desativado: ${motivo}` : `${autorizacao.motivo || ''} | Desativado pelo admin`,
                atualizadoEm: new Date()
            }
        });
        
        console.log(`✅ Autorização desativada: ${autorizacaoId}`);
        
        res.json({
            success: true,
            message: 'Autorização desativada!',
            autorizacao: autorizacaoAtualizada
        });
        
    } catch (error) {
        console.error('❌ Erro ao desativar autorização:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao desativar autorização'
        });
    }
});

// ✅ 6. LISTAR TODAS AS AUTORIZAÇÕES COM FILTROS (ADMIN)
app.get('/api/autorizacoes', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            usuarioId, 
            cursoId, 
            ativo,
            tipo,
            dataInicio,
            dataFim
        } = req.query;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const whereClause = {};
        
        if (usuarioId) whereClause.usuarioId = parseInt(usuarioId);
        if (cursoId) whereClause.cursoId = parseInt(cursoId);
        if (ativo !== undefined) whereClause.ativo = ativo === 'true';
        if (tipo) whereClause.tipo = tipo;
        
        // Filtro por data
        if (dataInicio || dataFim) {
            whereClause.criadoEm = {};
            if (dataInicio) whereClause.criadoEm.gte = new Date(dataInicio);
            if (dataFim) whereClause.criadoEm.lte = new Date(dataFim);
        }
        
        console.log(`📋 Buscando autorizações - Filtros:`, whereClause);
        
        const [autorizacoes, total] = await Promise.all([
            prisma.autorizacaoAula.findMany({
                where: whereClause,
                include: {
                    usuario: {
                        select: { id: true, nome: true, ra: true }
                    },
                    curso: {
                        select: { id: true, titulo: true }
                    },
                    aula: {
                        select: { id: true, titulo: true }
                    },
                    modulo: {
                        select: { id: true, titulo: true }
                    },
                    admin: {
                        select: { nome: true }
                    }
                },
                orderBy: { criadoEm: 'desc' },
                skip: skip,
                take: parseInt(limit)
            }),
            prisma.autorizacaoAula.count({ where: whereClause })
        ]);
        
        console.log(`✅ ${autorizacoes.length} autorizações encontradas (Total: ${total})`);
        
        res.json({
            success: true,
            autorizacoes: autorizacoes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar autorizações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar autorizações'
        });
    }
});

// ========== SOLICITAÇÕES DE AUTORIZAÇÃO ========== //

app.get('/api/solicitacoes', async (req, res) => {
    try {
        console.log('📋 GET /api/solicitacoes - Buscando todas as solicitações');
        
        const { status, tipo, cursoId, usuarioId } = req.query;
        
        const whereClause = {};
        if (status) whereClause.status = status;
        if (tipo) whereClause.tipo = tipo;
        if (cursoId) whereClause.cursoId = parseInt(cursoId);
        if (usuarioId) whereClause.usuarioId = parseInt(usuarioId);
        
        const solicitacoes = await prisma.solicitacaoAutorizacao.findMany({
            where: whereClause,
            include: {
                usuario: {
                    select: { 
                        id: true, 
                        nome: true, 
                        ra: true, 
                        serie: true, 
                        curso: true 
                    }
                },
                curso: {
                    select: { 
                        id: true, 
                        titulo: true, 
                        materia: true 
                    }
                },
                aula: {
                    select: { 
                        id: true, 
                        titulo: true 
                    }
                },
                modulo: {
                    select: { 
                        id: true, 
                        titulo: true 
                    }
                },
                admin: {
                    select: { 
                        nome: true 
                    }
                }
            },
            orderBy: { 
                criadoEm: 'desc' 
            }
        });
        
        console.log(`✅ ${solicitacoes.length} solicitações encontradas`);
        
        res.json({
            success: true,
            solicitacoes: solicitacoes,
            total: solicitacoes.length,
            resumo: {
                pendentes: solicitacoes.filter(s => s.status === 'pendente').length,
                aprovadas: solicitacoes.filter(s => s.status === 'aprovado').length,
                rejeitadas: solicitacoes.filter(s => s.status === 'rejeitado').length
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar solicitações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar solicitações'
        });
    }
});

// ✅ POST CRIAR SOLICITAÇÃO DE AUTORIZAÇÃO - VERSÃO CORRIGIDA
app.post('/api/solicitacoes', async (req, res) => {
    console.log('\n=== SOLICITAÇÃO RECEBIDA (Geral) ===');
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { 
            usuarioId, 
            cursoId, 
            aulaId, 
            motivo 
        } = req.body;

        // VALIDAÇÃO BÁSICA
        if (!usuarioId || !cursoId || !aulaId) {
            console.log('❌ Validação falhou: dados faltando');
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos',
                details: 'Forneça usuarioId, cursoId e aulaId'
            });
        }

        console.log(`📝 Criando solicitação: Usuário=${usuarioId}, Aula=${aulaId}`);

        // 1. Verificar se usuário existe
        const usuario = await prisma.usuario.findUnique({
            where: { id: parseInt(usuarioId) }
        });
        
        if (!usuario) {
            console.log(`❌ Usuário não encontrado: ${usuarioId}`);
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // 2. Verificar se curso existe
        const curso = await prisma.curso.findUnique({
            where: { id: parseInt(cursoId) }
        });
        
        if (!curso) {
            console.log(`❌ Curso não encontrado: ${cursoId}`);
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }

        // 3. Verificar se aula existe
        const aula = await prisma.aula.findUnique({
            where: { id: parseInt(aulaId) },
            include: { modulo: true }
        });
        
        if (!aula) {
            console.log(`❌ Aula não encontrada: ${aulaId}`);
            return res.status(404).json({
                success: false,
                error: 'Aula não encontrada'
            });
        }

        // 4. Verificar se já existe solicitação similar pendente
        const solicitacaoExistente = await prisma.solicitacaoAutorizacao.findFirst({
            where: {
                usuarioId: parseInt(usuarioId),
                cursoId: parseInt(cursoId),
                aulaId: parseInt(aulaId),
                status: 'pendente'
            }
        });

        if (solicitacaoExistente) {
            console.log(`⚠️ Solicitação já existe e está pendente: ${solicitacaoExistente.id}`);
            return res.status(409).json({
                success: false,
                error: 'Solicitação já existe',
                details: 'Já existe uma solicitação pendente para esta aula',
                solicitacaoId: solicitacaoExistente.id
            });
        }

        // 5. Criar nova solicitação (SEM campos que não existem no schema)
        const novaSolicitacao = await prisma.solicitacaoAutorizacao.create({
            data: {
                usuarioId: parseInt(usuarioId),
                cursoId: parseInt(cursoId),
                aulaId: parseInt(aulaId),
                moduloId: aula.moduloId,
                motivo: motivo || `Solicitação do usuário ${usuario.nome} para a aula "${aula.titulo}"`,
                status: 'pendente',
                criadoEm: new Date(),
                atualizadoEm: new Date()
            },
            include: {
                usuario: {
                    select: { id: true, nome: true, ra: true }
                },
                curso: {
                    select: { id: true, titulo: true }
                },
                aula: {
                    select: { id: true, titulo: true }
                }
            }
        });

        console.log(`✅ Solicitação criada com sucesso: ${novaSolicitacao.id}`);
        console.log(`📧 Detalhes: Usuário=${usuario.nome}, Curso=${curso.titulo}, Aula=${aula.titulo}`);

        return res.status(201).json({
            success: true,
            message: 'Solicitação enviada ao administrador!',
            solicitacaoId: novaSolicitacao.id,
            solicitacao: novaSolicitacao
        });

    } catch (error) {
        console.error('💥 ERRO INESPERADO:', error);
        console.error('Stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'Erro ao processar solicitação',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
        });
    }
});

app.post('/api/solicitacoes/automatica', async (req, res) => {
    console.log('🤖 ===== SOLICITAÇÃO AUTOMÁTICA INICIADA =====');
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));
    console.log('🕐 Timestamp:', new Date().toISOString());
    
    try {
        const { usuarioId, cursoId, aulaConcluidaId } = req.body;
        
        // VALIDAÇÃO DETALHADA
        if (!usuarioId || !cursoId || !aulaConcluidaId) {
            console.log('❌ VALIDAÇÃO FALHOU - Dados faltando:', {
                usuarioId: !!usuarioId,
                cursoId: !!cursoId,
                aulaConcluidaId: !!aulaConcluidaId
            });
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos',
                details: 'Forneça usuarioId, cursoId e aulaConcluidaId',
                received: { usuarioId, cursoId, aulaConcluidaId }
            });
        }
        
        console.log(`📝 PROCESSANDO: Usuário=${usuarioId}, Curso=${cursoId}, AulaConcluida=${aulaConcluidaId}`);
        
        // CONVERTER IDs
        const usuarioIdInt = parseInt(usuarioId);
        const cursoIdInt = parseInt(cursoId);
        const aulaConcluidaIdInt = parseInt(aulaConcluidaId);
        
        console.log(`🔢 IDs convertidos: Usuário=${usuarioIdInt}, Curso=${cursoIdInt}, Aula=${aulaConcluidaIdInt}`);
        
        // 1. VERIFICAR SE A AULA CONCLUÍDA EXISTE
        console.log(`🔍 Buscando aula concluída ID: ${aulaConcluidaIdInt}`);
        
        const aulaConcluida = await prisma.aula.findUnique({
            where: { 
                id: aulaConcluidaIdInt,
                ativo: true 
            },
            include: {
                modulo: {
                    include: {
                        aulas: {
                            where: { 
                                ativo: true,
                                id: { not: aulaConcluidaIdInt }
                            },
                            orderBy: { ordem: 'asc' }
                        }
                    }
                }
            }
        });
        
        if (!aulaConcluida) {
            console.log(`❌ AULA NÃO ENCONTRADA ou INATIVA: ${aulaConcluidaIdInt}`);
            return res.status(404).json({
                success: false,
                error: 'Aula não encontrada',
                details: `A aula ID ${aulaConcluidaId} não existe ou está inativa`
            });
        }
        
        console.log(`✅ AULA ENCONTRADA: "${aulaConcluida.titulo}" (Módulo: ${aulaConcluida.moduloId})`);
        
        // 2. ENCONTRAR PRÓXIMA AULA
        console.log('🔍 Buscando próxima aula...');
        
        let proximaAula = null;
        const modulo = aulaConcluida.modulo;
        
        // Primeiro, verificar no mesmo módulo
        if (modulo && modulo.aulas && modulo.aulas.length > 0) {
            proximaAula = modulo.aulas[0];
            console.log(`✅ PRÓXIMA AULA NO MESMO MÓDULO: "${proximaAula.titulo}" (ID: ${proximaAula.id})`);
        } else {
            // Buscar próximo módulo
            console.log(`🔍 Buscando próximo módulo após ordem ${modulo?.ordem || 1}`);
            
            const proximoModulo = await prisma.modulo.findFirst({
                where: {
                    cursoId: cursoIdInt,
                    ordem: modulo ? { gt: modulo.ordem } : 1,
                    ativo: true
                },
                include: {
                    aulas: {
                        where: { ativo: true },
                        orderBy: { ordem: 'asc' },
                        take: 1
                    }
                },
                orderBy: { ordem: 'asc' }
            });
            
            if (proximoModulo && proximoModulo.aulas.length > 0) {
                proximaAula = proximoModulo.aulas[0];
                console.log(`✅ PRÓXIMA AULA NO PRÓXIMO MÓDULO: "${proximaAula.titulo}" (Módulo: ${proximoModulo.titulo})`);
            }
        }
        
        if (!proximaAula) {
            console.log('📭 NÃO HÁ PRÓXIMA AULA - Curso concluído ou sem aulas ativas');
            return res.json({
                success: true,
                message: 'Não há próxima aula para solicitar',
                cursoConcluido: true,
                proximaAula: null
            });
        }
        
        // 3. VERIFICAR SE JÁ EXISTE SOLICITAÇÃO PENDENTE
        console.log(`🔍 Verificando solicitações existentes para aula ${proximaAula.id}...`);
        
        const solicitacaoExistente = await prisma.solicitacaoAutorizacao.findFirst({
            where: {
                usuarioId: usuarioIdInt,
                cursoId: cursoIdInt,
                aulaId: proximaAula.id,
                status: 'pendente'
            }
        });
        
        if (solicitacaoExistente) {
            console.log(`⚠️ SOLICITAÇÃO JÁ EXISTE: ID ${solicitacaoExistente.id}`);
            return res.json({
                success: true,
                message: 'Solicitação já existe',
                solicitacaoId: solicitacaoExistente.id,
                proximaAula: {
                    id: proximaAula.id,
                    titulo: proximaAula.titulo
                }
            });
        }
        
        // 4. CRIAR NOVA SOLICITAÇÃO AUTOMÁTICA
        console.log(`📝 Criando solicitação automática...`);
        
        const dadosSolicitacao = {
            usuarioId: usuarioIdInt,
            cursoId: cursoIdInt,
            aulaId: proximaAula.id,
            moduloId: proximaAula.moduloId,
            motivo: `✅ SISTEMA AUTOMÁTICO: Aluno completou "${aulaConcluida.titulo}" e está pronto para "${proximaAula.titulo}"`,
            status: 'pendente',
            tipo: 'automatica',
            automatica: true,
            criadoEm: new Date(),
            atualizadoEm: new Date()
        };
        
        console.log('📦 Dados da solicitação:', dadosSolicitacao);
        
        const novaSolicitacao = await prisma.solicitacaoAutorizacao.create({
            data: dadosSolicitacao,
            include: {
                usuario: { 
                    select: { 
                        id: true, 
                        nome: true, 
                        ra: true 
                    } 
                },
                curso: { 
                    select: { 
                        id: true, 
                        titulo: true 
                    } 
                },
                aula: { 
                    select: { 
                        id: true, 
                        titulo: true 
                    } 
                }
            }
        });
        
        console.log(`✅ SOLICITAÇÃO CRIADA COM SUCESSO: ID ${novaSolicitacao.id}`);
        
        try {
            await prisma.notificacaoAmizade.create({
                data: {
                    tipo: 'solicitacao_aula',
                    usuarioId: 1, // Admin
                    remetenteId: usuarioIdInt,
                    lida: false,
                    mensagem: `🎯 SOLICITAÇÃO AUTOMÁTICA: ${novaSolicitacao.usuario.nome} completou "${aulaConcluida.titulo}" e aguarda "${proximaAula.titulo}"`
                }
            });
            console.log('🔔 Notificação criada para admin');
        } catch (notifError) {
            console.warn('⚠️ Erro ao criar notificação:', notifError.message);
        }
        
        console.log('🤖 ===== SOLICITAÇÃO AUTOMÁTICA CONCLUÍDA =====\n');
        
        return res.status(201).json({
            success: true,
            message: 'Solicitação automática registrada com sucesso!',
            solicitacaoId: novaSolicitacao.id,
            solicitacao: novaSolicitacao,
            proximaAula: {
                id: proximaAula.id,
                titulo: proximaAula.titulo,
                moduloId: proximaAula.moduloId
            },
            aulaConcluida: {
                id: aulaConcluida.id,
                titulo: aulaConcluida.titulo
            }
        });
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO NA SOLICITAÇÃO AUTOMÁTICA:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('Código:', error.code);
        console.error('Metadados:', error.meta);
        
        // Identificar tipo de erro
        let mensagemUsuario = 'Erro ao processar solicitação automática';
        let detalhes = 'Erro interno';
        let statusCode = 500;
        
        if (error.code === 'P2002') {
            mensagemUsuario = 'Solicitação já existe';
            detalhes = 'Já existe uma solicitação idêntica';
            statusCode = 409;
        } else if (error.code === 'P2025') {
            mensagemUsuario = 'Registro não encontrado';
            detalhes = 'Verifique os IDs fornecidos';
            statusCode = 404;
        } else if (error.code === 'P2003') {
            mensagemUsuario = 'Erro de referência';
            detalhes = 'ID de usuário, curso ou aula inválido';
            statusCode = 400;
        } else if (error.code === 'P1001') {
            mensagemUsuario = 'Banco de dados indisponível';
            detalhes = 'Não foi possível conectar ao banco';
            statusCode = 503;
        }
        
        return res.status(statusCode).json({
            success: false,
            error: mensagemUsuario,
            details: detalhes,
            internalError: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: error.code
        });
    }
});

// ✅ 9. LISTAR SOLICITAÇÕES PENDENTES (ADMIN)
app.get('/api/solicitacoes/pendentes', async (req, res) => {
    try {
        console.log('📋 Buscando solicitações pendentes...');
        
        const { tipo, cursoId, usuarioId } = req.query;
        
        const whereClause = { 
            status: 'pendente' 
        };
        
        if (tipo) whereClause.tipo = tipo;
        if (cursoId) whereClause.cursoId = parseInt(cursoId);
        if (usuarioId) whereClause.usuarioId = parseInt(usuarioId);
        
        const solicitacoes = await prisma.solicitacaoAutorizacao.findMany({
            where: whereClause,
            include: {
                usuario: {
                    select: { 
                        id: true, 
                        nome: true, 
                        ra: true, 
                        serie: true, 
                        curso: true 
                    }
                },
                curso: {
                    select: { 
                        id: true, 
                        titulo: true, 
                        materia: true 
                    }
                },
                aula: {
                    select: { 
                        id: true, 
                        titulo: true 
                    }
                },
                modulo: {
                    select: { 
                        id: true, 
                        titulo: true 
                    }
                },
                admin: {
                    select: { 
                        nome: true 
                    }
                }
            },
            orderBy: { 
                criadoEm: 'desc' 
            },
            take: 50
        });
        
        console.log(`✅ ${solicitacoes.length} solicitações pendentes encontradas`);
        
        res.json({
            success: true,
            solicitacoes: solicitacoes,
            total: solicitacoes.length,
            tipos: {
                manual: solicitacoes.filter(s => s.tipo === 'manual').length,
                automatica: solicitacoes.filter(s => s.tipo === 'automatica').length
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar solicitações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar solicitações pendentes'
        });
    }
});

// ✅ 10. APROVAR SOLICITAÇÃO (ADMIN)
app.put('/api/solicitacoes/:id/aprovar', async (req, res) => {
    try {
        const solicitacaoId = validateId(req.params.id);
        const { adminId, motivo, dataExpiracao } = req.body;
        
        console.log(`✅ Aprovando solicitação ${solicitacaoId} pelo admin ${adminId}`);
        
        if (!solicitacaoId || !adminId) {
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos',
                details: 'Forneça solicitacaoId e adminId'
            });
        }
        
        const admin = await prisma.usuario.findUnique({
            where: { id: parseInt(adminId) }
        });
        
        if (!admin) {
            console.log(`❌ Admin ${adminId} não existe!`);
            
            const primeiroAdmin = await prisma.usuario.findFirst({
                where: { status: 'ativo' },
                orderBy: { id: 'asc' }
            });
            
            if (!primeiroAdmin) {
                return res.status(404).json({
                    success: false,
                    error: 'Nenhum administrador disponível',
                    details: 'Não há usuários cadastrados no sistema'
                });
            }
            
            console.log(`🔄 Usando admin alternativo: ${primeiroAdmin.id} - ${primeiroAdmin.nome}`);
            
            return await aprovarComAdmin(solicitacaoId, primeiroAdmin.id, motivo, dataExpiracao, res);
        }
        
        return await aprovarComAdmin(solicitacaoId, parseInt(adminId), motivo, dataExpiracao, res);
        
    } catch (error) {
        console.error('❌ Erro ao aprovar solicitação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao aprovar solicitação',
            details: error.message
        });
    }
});

async function aprovarComAdmin(solicitacaoId, adminId, motivo, dataExpiracao, res) {
    try {
        const solicitacao = await prisma.solicitacaoAutorizacao.findUnique({
            where: { id: solicitacaoId }
        });
        
        if (!solicitacao) {
            return res.status(404).json({
                success: false,
                error: 'Solicitação não encontrada'
            });
        }
        
        if (solicitacao.status !== 'pendente') {
            return res.status(400).json({
                success: false,
                error: 'Solicitação já processada',
                details: `Status atual: ${solicitacao.status}`
            });
        }
        
        const autorizacao = await prisma.autorizacaoAula.create({
            data: {
                tipo: 'liberar_aula',
                usuarioId: solicitacao.usuarioId,
                cursoId: solicitacao.cursoId,
                aulaId: solicitacao.aulaId,
                moduloId: solicitacao.moduloId,
                motivo: motivo || `Aprovado via solicitação #${solicitacao.id}`,
                dataExpiracao: dataExpiracao ? new Date(dataExpiracao) : null,
                adminId: adminId,
                ativo: true,
                criadoEm: new Date(),
                atualizadoEm: new Date()
            }
        });
        
        await prisma.solicitacaoAutorizacao.update({
            where: { id: solicitacaoId },
            data: {
                status: 'aprovado',
                motivoRejeicao: null,
                processadoEm: new Date(),
                adminId: adminId,
                autorizacaoId: autorizacao.id,
                atualizadoEm: new Date()
            }
        });
        
        console.log(`✅ Solicitação ${solicitacaoId} aprovada por admin ${adminId}`);
        
        res.json({
            success: true,
            message: 'Solicitação aprovada e autorização criada!',
            autorizacaoId: autorizacao.id
        });
        
    } catch (error) {
        console.error('💥 Erro na aprovação:', error);
        throw error;
    }
}

// ✅ 11. REJEITAR SOLICITAÇÃO (ADMIN)
app.put('/api/solicitacoes/:id/rejeitar', async (req, res) => {
    try {
        const solicitacaoId = validateId(req.params.id);
        const { adminId, motivoRejeicao } = req.body;
        
        if (!solicitacaoId || !adminId) {
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos',
                details: 'Forneça solicitacaoId e adminId'
            });
        }
        
        console.log(`❌ Rejeitando solicitação: ${solicitacaoId} pelo admin: ${adminId}`);
        
        const solicitacao = await prisma.solicitacaoAutorizacao.findUnique({
            where: { id: solicitacaoId }
        });
        
        if (!solicitacao) {
            return res.status(404).json({
                success: false,
                error: 'Solicitação não encontrada'
            });
        }
        
        if (solicitacao.status !== 'pendente') {
            return res.status(400).json({
                success: false,
                error: 'Solicitação já processada',
                details: `Status atual: ${solicitacao.status}`
            });
        }
        
        const solicitacaoAtualizada = await prisma.solicitacaoAutorizacao.update({
            where: { id: solicitacaoId },
            data: {
                status: 'rejeitado',
                motivoRejeicao: motivoRejeicao || 'Solicitação rejeitada pelo administrador.',
                processadoEm: new Date(),
                adminId: parseInt(adminId),
                atualizadoEm: new Date()
            },
            include: {
                usuario: {
                    select: { nome: true, ra: true }
                },
                curso: {
                    select: { titulo: true }
                }
            }
        });
        
        console.log(`✅ Solicitação rejeitada: ${solicitacaoId}`);
        
        res.json({
            success: true,
            message: 'Solicitação rejeitada!',
            solicitacao: solicitacaoAtualizada
        });
        
    } catch (error) {
        console.error('❌ Erro ao rejeitar solicitação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao rejeitar solicitação'
        });
    }
});

// ✅ 12. HISTÓRICO DE SOLICITAÇÕES POR USUÁRIO
app.get('/api/solicitacoes/usuario/:usuarioId', async (req, res) => {
    try {
        const usuarioId = validateId(req.params.usuarioId);
        const { status, cursoId, limit = 20 } = req.query;
        
        if (!usuarioId) {
            return res.status(400).json({
                success: false,
                error: 'ID do usuário inválido'
            });
        }
        
        console.log(`📊 Buscando histórico de solicitações - Usuário: ${usuarioId}`);
        
        const whereClause = { usuarioId };
        if (status) whereClause.status = status;
        if (cursoId) whereClause.cursoId = parseInt(cursoId);
        
        const solicitacoes = await prisma.solicitacaoAutorizacao.findMany({
            where: whereClause,
            include: {
                curso: { 
                    select: { 
                        titulo: true, 
                        materia: true 
                    } 
                },
                aula: { 
                    select: { 
                        titulo: true 
                    } 
                },
                modulo: { 
                    select: { 
                        titulo: true 
                    } 
                },
                admin: { 
                    select: { 
                        nome: true 
                    } 
                }
            },
            orderBy: { 
                criadoEm: 'desc' 
            },
            take: parseInt(limit)
        });
        
        res.json({
            success: true,
            solicitacoes: solicitacoes,
            total: solicitacoes.length,
            resumo: {
                pendentes: solicitacoes.filter(s => s.status === 'pendente').length,
                aprovadas: solicitacoes.filter(s => s.status === 'aprovado').length,
                rejeitadas: solicitacoes.filter(s => s.status === 'rejeitado').length
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar histórico'
        });
    }
});

// ✅ 13. EXCLUIR SOLICITAÇÃO
app.delete('/api/solicitacoes/:id', async (req, res) => {
    try {
        const solicitacaoId = validateId(req.params.id);
        
        if (!solicitacaoId) {
            return res.status(400).json({
                success: false,
                error: 'ID inválido'
            });
        }
        
        console.log(`🗑️ Excluindo solicitação: ${solicitacaoId}`);
        
        const solicitacao = await prisma.solicitacaoAutorizacao.findUnique({
            where: { id: solicitacaoId }
        });
        
        if (!solicitacao) {
            return res.status(404).json({
                success: false,
                error: 'Solicitação não encontrada'
            });
        }
        
        await prisma.solicitacaoAutorizacao.delete({
            where: { id: solicitacaoId }
        });
        
        console.log(`✅ Solicitação excluída: ${solicitacaoId}`);
        
        res.json({
            success: true,
            message: 'Solicitação excluída com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir solicitação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir solicitação'
        });
    }
});

// ========== ENDPOINTS AUXILIARES ========== //

// ✅ 14. BUSCAR AULAS PARA DROPDOWN (INTERFACE)
app.get('/api/cursos/:cursoId/aulas', async (req, res) => {
    try {
        const cursoId = validateId(req.params.cursoId);
        
        if (!cursoId) {
            return res.status(400).json({
                success: false,
                error: 'ID do curso inválido'
            });
        }
        
        const aulas = await prisma.aula.findMany({
            where: {
                modulo: {
                    cursoId: cursoId
                },
                ativo: true
            },
            include: {
                modulo: {
                    select: {
                        id: true,
                        titulo: true,
                        ordem: true
                    }
                }
            },
            orderBy: [
                { modulo: { ordem: 'asc' } },
                { ordem: 'asc' }
            ]
        });
        
        res.json({
            success: true,
            aulas: aulas,
            total: aulas.length,
            modulos: [...new Set(aulas.map(a => a.modulo.id))].length
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar aulas:', error);
        handleError(res, error, 'Erro ao buscar aulas');
    }
});

// ✅ 15. STATUS DO SISTEMA DE AUTORIZAÇÃO
app.get('/api/sistema/autorizacao/status', async (req, res) => {
    try {
        // Configuração do sistema
        const config = {
            sistemaAtivo: true,
            modo: "bloqueio_progressivo",
            mensagem: "Sistema de autorização ativo - Todas as aulas requerem autorização",
            versao: "1.0.0",
            dataAtualizacao: new Date().toISOString()
        };
        
        res.json({
            success: true,
            sistema: config
        });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar status do sistema');
    }
});

// ✅ 16. ESTATÍSTICAS DO SISTEMA DE AUTORIZAÇÃO
app.get('/api/sistema/autorizacao/estatisticas', async (req, res) => {
    try {
        const [
            totalAutorizacoes,
            autorizacoesAtivas,
            totalSolicitacoes,
            solicitacoesPendentes,
            usuariosComAutorizacoes
        ] = await Promise.all([
            prisma.autorizacaoAula.count(),
            prisma.autorizacaoAula.count({ where: { ativo: true } }),
            prisma.solicitacaoAutorizacao.count(),
            prisma.solicitacaoAutorizacao.count({ where: { status: 'pendente' } }),
            prisma.autorizacaoAula.groupBy({
                by: ['usuarioId'],
                _count: true
            }).then(results => results.length)
        ]);
        
        // Últimas solicitações
        const ultimasSolicitacoes = await prisma.solicitacaoAutorizacao.findMany({
            where: { status: 'pendente' },
            include: {
                usuario: { select: { nome: true, ra: true } },
                curso: { select: { titulo: true } }
            },
            orderBy: { criadoEm: 'desc' },
            take: 5
        });
        
        res.json({
            success: true,
            estatisticas: {
                totalAutorizacoes,
                autorizacoesAtivas,
                totalSolicitacoes,
                solicitacoesPendentes,
                usuariosComAutorizacoes,
                taxaAprovacao: totalSolicitacoes > 0 
                    ? Math.round(((totalSolicitacoes - solicitacoesPendentes) / totalSolicitacoes) * 100) 
                    : 0,
                taxaUsoSistema: usuariosComAutorizacoes > 0 
                    ? Math.round((usuariosComAutorizacoes / await prisma.usuario.count()) * 100)
                    : 0
            },
            ultimasSolicitacoes,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar estatísticas'
        });
    }
});

// ========== SISTEMA DE VÍDEOS ========== //

app.get('/api/videos', async (req, res) => {
    console.log('🎬 GET /api/videos - INÍCIO');
    
    try {
        const videos = await prisma.video.findMany({ 
            orderBy: { materia: 'asc' },
            select: {
                id: true,
                titulo: true,
                materia: true,
                categoria: true,
                descricao: true,
                duracao: true,
                criadoEm: true,
                atualizadoEm: true,
                url: true,
                iv: true,
                tag: true
            }
        });
        
        console.log(`✅ ${videos.length} vídeos encontrados no banco`);
        
        res.json(videos);
        
        console.log('🎬 GET /api/videos - FIM (sucesso)');
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO EM /api/videos:', error.message);
        console.error('Stack:', error.stack);
        
        res.json([]);
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

app.use((error, req, res, next) => {
  console.error('❌ Erro global não tratado:', error);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'JSON inválido',
      details: 'O corpo da requisição contém JSON malformado'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// ... seu código ...

// ========== CAPTURADOR DE ERROS GLOBAL ========== //
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error.message);
    console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:');
    console.error('Reason:', reason);
});

// ========== INICIALIZAÇÃO DO SERVIDOR ========== //
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor Coliseum API...');
        
        // Testar conexão com banco
        try {
          await prisma.$connect();
          console.log('✅ Conectado ao banco de dados com sucesso!');
        } catch (dbError) {
          console.error('❌ Não foi possível conectar ao banco de dados:', dbError.message);
          console.log('⚠️ Continuando sem banco de dados...');
        }
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n📍 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🌐 Production: https://coliseum-api.onrender.com`);
            console.log(`\n✨ API Coliseum totalmente operacional!`);
            console.log(`⏰ Iniciado em: ${new Date().toISOString()}`);
        });
        
        // Keep-alive para conexão
        server.keepAliveTimeout = 120000;
        server.headersTimeout = 120000;
        
        const keepAliveInterval = setInterval(async () => {
          try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('🔄 Keep-alive: Conexão com banco mantida');
          } catch (error) {
            console.warn('⚠️ Keep-alive falhou:', error.message);
          }
        }, 30000);
        
        server.on('close', () => {
          clearInterval(keepAliveInterval);
          prisma.$disconnect();
        });
        
        return server;
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

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

startServer();




















