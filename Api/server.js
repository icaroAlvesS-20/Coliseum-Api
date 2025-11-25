import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÕES ========== //

// ✅ Configuração do Prisma
const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
});

// ✅ CONFIGURAÇÃO CORS FLEXÍVEL - SUBSTITUA POR ESTA:
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sem origin (como mobile apps ou curl)
    if (!origin) return callback(null, true);
    
    // Lista de domínios permitidos
    const allowedOrigins = [
      /https:\/\/coliseum-.*-icaroass-projects\.vercel\.app$/,
      /https:\/\/coliseum-.*\.vercel\.app$/,
      'http://localhost:3000',
      'http://localhost:5173'
    ];
    
    // Verificar se a origin está na lista de permitidos
    if (allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') {
        return origin === pattern;
      }
      return pattern.test(origin);
    })) {
      return callback(null, true);
    } else {
      console.log('🚫 CORS bloqueado para origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  optionsSuccessStatus: 200
};

// Aplicar CORS
app.use(cors(corsOptions));
app.use(express.json());

// ✅ MIDDLEWARE CORS MANUAL (adicione como backup)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Permitir qualquer domínio do Vercel
  if (origin && origin.includes('vercel.app')) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', 'https://coliseum-g7atjk4ho-icaroass-projects.vercel.app');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Responder a preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// ========== MIDDLEWARES ========== //

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Middleware de headers CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Middleware de log
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`, req.body || req.query);
  next();
});

// ========== UTILITÁRIOS ========== //

/**
 * Valida se um ID é numérico
 */
const validateId = (id) => {
  const numId = parseInt(id);
  return !isNaN(numId) ? numId : null;
};

/**
 * Tratamento padrão de erros
 */
const handleError = (res, error, message = 'Erro interno do servidor') => {
  console.error(`❌ ${message}:`, error);
  res.status(500).json({ 
    error: message,
    details: error.message 
  });
};

// ========== ROTAS BÁSICAS ========== //

app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Coliseum Backend - Online',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const [totalUsuarios, totalVideos, totalCursos] = await Promise.all([
      prisma.usuario.count().catch(() => 0),
      prisma.video.count().catch(() => 0),
      prisma.curso.count().catch(() => 0)
    ]);

    res.json({ 
      status: 'online',
      totalUsuarios,
      totalVideos,
      totalCursos,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleError(res, error, 'Erro no health check');
  }
});

// ========== SISTEMA DE CURSOS ========== //

// 📚 GET /api/cursos - Listar todos os cursos
app.get('/api/cursos', async (req, res) => {
  try {
    console.log('📚 Buscando todos os cursos...');

    const cursos = await prisma.curso.findMany({
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

    console.log(`✅ ${cursos.length} cursos carregados`);
    res.json(cursos);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar cursos');
  }
});

// 🎯 GET /api/cursos/:id - Buscar curso específico
app.get('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    console.log(`🎯 Buscando curso específico ID: ${cursoId}`);

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
      console.log(`❌ Curso ${cursoId} não encontrado`);
      return res.status(404).json({ 
        error: 'Curso não encontrado',
        cursoId: cursoId
      });
    }

    console.log(`✅ Curso encontrado: ${curso.titulo} com ${curso.modulos?.length || 0} módulos`);
    res.json(curso);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar curso');
  }
});

// ➕ POST /api/cursos - Criar novo curso
app.post('/api/cursos', async (req, res) => {
  try {
    console.log('🎯 Criando novo curso...', req.body);
    
    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo, modulos } = req.body;

    // Validação de dados obrigatórios
    if (!titulo || !materia || !categoria || !nivel || !duracao) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        required: ['titulo', 'materia', 'categoria', 'nivel', 'duracao']
      });
    }

    const novoCurso = await prisma.$transaction(async (tx) => {
      // Criar o curso
      const curso = await tx.curso.create({
        data: {
          titulo: titulo.trim(),
          descricao: descricao?.trim() || '',
          materia: materia.trim(),
          categoria: categoria.trim(),
          nivel: nivel.trim(),
          duracao: parseInt(duracao),
          imagem: imagem?.trim() || null,
          ativo: ativo !== undefined ? ativo : true
        }
      });

      // Criar módulos e aulas se fornecidos
      if (modulos?.length > 0) {
        for (const moduloData of modulos) {
          const modulo = await tx.modulo.create({
            data: {
              titulo: moduloData.titulo.trim(),
              descricao: moduloData.descricao?.trim() || '',
              ordem: moduloData.ordem || 1,
              cursoId: curso.id,
              ativo: true
            }
          });

          // Criar aulas do módulo
          if (moduloData.aulas?.length > 0) {
            for (const aulaData of moduloData.aulas) {
              await tx.aula.create({
                data: {
                  titulo: aulaData.titulo.trim(),
                  descricao: aulaData.descricao?.trim() || '',
                  conteudo: aulaData.conteudo?.trim() || '',
                  videoUrl: aulaData.videoUrl?.trim() || null,
                  duracao: parseInt(aulaData.duracao) || 15,
                  ordem: aulaData.ordem || 1,
                  moduloId: modulo.id,
                  ativo: true
                }
              });
            }
          }
        }
      }

      // Retornar curso completo
      return await tx.curso.findUnique({
        where: { id: curso.id },
        include: {
          modulos: {
            include: { aulas: true }
          }
        }
      });
    });

    console.log(`✅ Curso criado com sucesso: ${novoCurso.titulo} (ID: ${novoCurso.id})`);
    res.status(201).json({
      success: true,
      message: 'Curso criado com sucesso!',
      curso: novoCurso
    });
  } catch (error) {
    handleError(res, error, 'Erro ao criar curso');
  }
});

// ✏️ PUT /api/cursos/:id - Atualizar curso
app.put('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo } = req.body;
    console.log(`✏️ Atualizando curso ID: ${cursoId}`, req.body);

    // Verificar se o curso existe
    const cursoExistente = await prisma.curso.findUnique({
      where: { id: cursoId }
    });

    if (!cursoExistente) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    // Preparar dados para atualização
    const updateData = { atualizadoEm: new Date() };
    
    const fields = {
      titulo: (val) => val.trim(),
      descricao: (val) => val.trim(),
      materia: (val) => val.trim(),
      categoria: (val) => val.trim(),
      nivel: (val) => val.trim(),
      duracao: (val) => parseInt(val),
      imagem: (val) => val?.trim() || null,
      ativo: (val) => val
    };

    Object.keys(fields).forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = fields[field](req.body[field]);
      }
    });

    // Atualizar curso
    const cursoAtualizado = await prisma.curso.update({
      where: { id: cursoId },
      data: updateData,
      include: {
        modulos: {
          include: { aulas: true }
        }
      }
    });

    console.log(`✅ Curso atualizado: ${cursoAtualizado.titulo}`);
    res.json({
      success: true,
      message: 'Curso atualizado com sucesso!',
      curso: cursoAtualizado
    });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar curso');
  }
});

// 🗑️ DELETE /api/cursos/:id - Excluir curso (soft delete)
app.delete('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    console.log(`🗑️ Excluindo curso ID: ${cursoId}`);

    // Verificar se o curso existe
    const cursoExistente = await prisma.curso.findUnique({
      where: { id: cursoId }
    });

    if (!cursoExistente) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    // Soft delete - marcar como inativo
    await prisma.curso.update({
      where: { id: cursoId },
      data: { 
        ativo: false,
        atualizadoEm: new Date()
      }
    });

    console.log(`✅ Curso marcado como inativo: ${cursoExistente.titulo}`);
    res.json({
      success: true,
      message: 'Curso excluído com sucesso!',
      cursoExcluido: {
        id: cursoExistente.id,
        titulo: cursoExistente.titulo
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir curso');
  }
});

// 📂 GET /api/cursos/:id/modulos - Módulos do curso
app.get('/api/cursos/:id/modulos', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    const usuarioId = validateId(req.query.usuarioId);
    
    if (!cursoId) {
      return res.status(400).json({ error: 'ID do curso inválido' });
    }

    console.log(`📂 Buscando módulos do curso ${cursoId}, usuário: ${usuarioId}`);

    // Verificar se o curso existe
    const cursoExiste = await prisma.curso.findUnique({
      where: { 
        id: cursoId,
        ativo: true 
      }
    });

    if (!cursoExiste) {
      return res.status(404).json({ 
        error: 'Curso não encontrado',
        cursoId: cursoId
      });
    }

    const modulos = await prisma.modulo.findMany({
      where: { 
        cursoId: cursoId,
        ativo: true
      },
      include: {
        aulas: {
          where: { ativo: true },
          orderBy: { ordem: 'asc' },
          include: {
            progressos: usuarioId ? {
              where: { usuarioId: usuarioId }
            } : false
          }
        }
      },
      orderBy: { ordem: 'asc' }
    });

    const totalAulas = modulos.reduce((acc, mod) => acc + mod.aulas.length, 0);
    console.log(`✅ ${modulos.length} módulos carregados com ${totalAulas} aulas`);
    
    res.json(modulos || []);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar módulos');
  }
});

// ========== SISTEMA DE AULAS ========== //

// 🎓 GET /api/aulas/:id - Detalhes da aula
app.get('/api/aulas/:id', async (req, res) => {
  try {
    const aulaId = validateId(req.params.id);
    const usuarioId = validateId(req.query.usuarioId);
    
    if (!aulaId) {
      return res.status(400).json({ error: 'ID da aula inválido' });
    }

    console.log(`🎓 Buscando aula ${aulaId}, usuário: ${usuarioId}`);

    const aula = await prisma.aula.findUnique({
      where: { 
        id: aulaId,
        ativo: true
      },
      include: {
        modulo: {
          include: { curso: true }
        },
        progressos: usuarioId ? {
          where: { usuarioId: usuarioId }
        } : false
      }
    });

    if (!aula) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    console.log(`✅ Aula encontrada: ${aula.titulo}`);
    res.json(aula);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar aula');
  }
});

// 📋 GET /api/aulas - Listar todas as aulas
app.get('/api/aulas', async (req, res) => {
  try {
    const { moduloId, cursoId } = req.query;
    
    let whereClause = { ativo: true };
    
    if (moduloId) {
      whereClause.moduloId = parseInt(moduloId);
    }
    
    if (cursoId) {
      whereClause.modulo = { cursoId: parseInt(cursoId) };
    }

    const aulas = await prisma.aula.findMany({
      where: whereClause,
      include: {
        modulo: {
          include: { curso: true }
        }
      },
      orderBy: { ordem: 'asc' }
    });

    console.log(`✅ ${aulas.length} aulas carregadas`);
    res.json(aulas);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar aulas');
  }
});
app.options('/api/progresso/aula', cors(corsOptions));

app.post('/api/progresso/aula', cors(corsOptions), async (req, res) => {
  try {
    const { usuarioId, aulaId, cursoId } = req.body;
    console.log(`📊 Registrando progresso - Usuário: ${usuarioId}, Aula: ${aulaId}, Curso: ${cursoId}`);

    if (!usuarioId || !aulaId || !cursoId) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        required: ['usuarioId', 'aulaId', 'cursoId']
      });
    }

    const aulaExiste = await prisma.aula.findUnique({
      where: { 
        id: parseInt(aulaId),
        ativo: true 
      }
    });

    if (!aulaExiste) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    const progressoAula = await prisma.progressoAula.upsert({
      where: {
        usuarioId_aulaId: {
          usuarioId: parseInt(usuarioId),
          aulaId: parseInt(aulaId)
        }
      },
      update: {
        concluida: true,
        dataConclusao: new Date(),
        cursoId: parseInt(cursoId)
      },
      create: {
        usuarioId: parseInt(usuarioId),
        aulaId: parseInt(aulaId),
        cursoId: parseInt(cursoId),
        concluida: true,
        dataConclusao: new Date()
      }
    });

    const totalAulas = await prisma.aula.count({
      where: { 
        modulo: { 
          cursoId: parseInt(cursoId),
          ativo: true
        },
        ativo: true
      }
    });

    const aulasConcluidas = await prisma.progressoAula.count({
      where: { 
        usuarioId: parseInt(usuarioId),
        cursoId: parseInt(cursoId),
        concluida: true
      }
    });

    const progressoCurso = totalAulas > 0 ? Math.round((aulasConcluidas / totalAulas) * 100) : 0;

    await prisma.progressoCurso.upsert({
      where: {
        usuarioId_cursoId: {
          usuarioId: parseInt(usuarioId),
          cursoId: parseInt(cursoId)
        }
      },
      update: {
        progresso: progressoCurso,
        concluido: progressoCurso >= 100,
        ultimaAula: parseInt(aulaId),
        atualizadoEm: new Date()
      },
      create: {
        usuarioId: parseInt(usuarioId),
        cursoId: parseInt(cursoId),
        progresso: progressoCurso,
        concluido: progressoCurso >= 100,
        ultimaAula: parseInt(aulaId)
      }
    });

    console.log(`✅ Progresso atualizado: ${progressoCurso}% (${aulasConcluidas}/${totalAulas} aulas)`);

    res.json({
      success: true,
      progresso: progressoCurso,
      concluido: progressoCurso >= 100,
      aulasConcluidas,
      totalAulas,
      message: 'Aula concluída com sucesso!'
    });
  } catch (error) {
    console.error('❌ Erro ao registrar progresso:', error);
    res.status(500).json({ 
      error: 'Erro ao salvar progresso',
      details: error.message,
      code: error.code
    });
  }
});

// ========== SISTEMA DE USUÁRIOS ========== //

app.post('/api/usuarios', async (req, res) => {
  try {
    const { ra, nome, senha, serie, curso, action = 'login' } = req.body;

    // Validação básica
    if (!ra || !senha) {
      return res.status(400).json({ error: 'RA e senha são obrigatórios' });
    }

    if (action === 'cadastro') {
      if (!nome || !serie || !curso) { // ✅ VALIDANDO CURSO
        return res.status(400).json({ 
          error: 'Nome, série e curso são obrigatórios para cadastro',
          required: ['nome', 'serie', 'curso']
        });
      }

      console.log('📝 Criando novo usuário:', { ra, nome, serie, curso });

      const novoUsuario = await prisma.usuario.create({
        data: {
          ra: ra.toString().trim(),
          nome: nome.trim(),
          senha: senha,
          serie: serie.toString().trim(),
          curso: curso.trim(), // ✅ SALVANDO CURSO
          pontuacao: 0,
          desafiosCompletados: 0
        }
      });

      console.log('✅ Usuário criado com sucesso:', novoUsuario);

      res.json({
        success: true,
        message: `Cadastro realizado! Bem-vindo, ${nome}!`,
        usuario: novoUsuario
      });
    } else {
    }
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'RA já cadastrado' });
    }
    handleError(res, error, 'Erro no sistema de usuários');
  }
});

app.get('/api/ranking', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        curso: true, // ✅ GARANTIR QUE ESTE CAMPO ESTÁ INCLUÍDO
        pontuacao: true,
        desafiosCompletados: true,
      },
      orderBy: { pontuacao: 'desc' }
    });

    console.log(`📊 Ranking carregado: ${usuarios.length} usuários`);
    console.log(`📚 Cursos encontrados:`, usuarios.map(u => u.curso).filter(Boolean));
    
    res.json(usuarios);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar ranking');
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const userId = validateId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const { nome, ra, serie, curso, pontuacao, desafiosCompletados } = req.body; // ✅ ADICIONAR CURSO
    console.log(`✏️ Atualizando usuário ID: ${userId}`, req.body);

    const updateData = { atualizadoEm: new Date() };
    
    const fields = {
      nome: (val) => val.trim(),
      ra: (val) => val.toString().trim(),
      serie: (val) => val.trim(),
      curso: (val) => val.trim(), // ✅ ADICIONAR ESTE CAMPO
      pontuacao: (val) => parseInt(val),
      desafiosCompletados: (val) => parseInt(val)
    };

    Object.keys(fields).forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = fields[field](req.body[field]);
      }
    });

    console.log('📤 Dados para atualização:', updateData);

    const usuarioAtualizado = await prisma.usuario.update({
      where: { id: userId },
      data: updateData
    });

    console.log(`✅ Usuário atualizado:`, usuarioAtualizado);
    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!',
      usuario: usuarioAtualizado
    });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar usuário');
  }
});

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
        nome: usuarioExistente.nome
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir usuário');
  }
});

// ========== SISTEMA DE VÍDEOS ========== //

app.get('/api/videos', async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      orderBy: { materia: 'asc' }
    });
    res.json(videos);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar vídeos');
  }
});

app.post('/api/videos', async (req, res) => {
  try {
    const { titulo, materia, categoria, url, descricao, duracao } = req.body;

    if (!titulo || !materia || !categoria || !url || !duracao) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        required: ['titulo', 'materia', 'categoria', 'url', 'duracao']
      });
    }

    const novoVideo = await prisma.video.create({
      data: {
        titulo: titulo.trim(),
        materia: materia.trim(),
        categoria: categoria.trim(),
        url: url.trim(),
        descricao: descricao ? descricao.trim() : '',
        duracao: parseInt(duracao)
      }
    });

    res.json({
      success: true,
      message: 'Vídeo adicionado com sucesso!',
      video: novoVideo
    });
  } catch (error) {
    handleError(res, error, 'Erro ao criar vídeo');
  }
});

app.put('/api/videos/:id', async (req, res) => {
  try {
    const videoId = validateId(req.params.id);
    if (!videoId) {
      return res.status(400).json({ error: 'ID do vídeo inválido' });
    }

    const { titulo, materia, categoria, url, descricao, duracao } = req.body;
    console.log(`✏️ Atualizando vídeo ID: ${videoId}`, req.body);

    const updateData = {};
    const fields = {
      titulo: (val) => val.trim(),
      materia: (val) => val.trim(),
      categoria: (val) => val.trim(),
      url: (val) => val.trim(),
      descricao: (val) => val.trim(),
      duracao: (val) => parseInt(val)
    };

    Object.keys(fields).forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = fields[field](req.body[field]);
      }
    });

    const videoAtualizado = await prisma.video.update({
      where: { id: videoId },
      data: updateData
    });

    console.log(`✅ Vídeo atualizado: ${videoAtualizado.titulo}`);
    res.json({
      success: true,
      message: 'Vídeo atualizado com sucesso!',
      video: videoAtualizado
    });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar vídeo');
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  try {
    const videoId = validateId(req.params.id);
    if (!videoId) {
      return res.status(400).json({ error: 'ID do vídeo inválido' });
    }

    console.log(`🗑️ Excluindo vídeo ID: ${videoId}`);

    const videoExistente = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!videoExistente) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    await prisma.video.delete({
      where: { id: videoId }
    });

    console.log(`✅ Vídeo excluído: ${videoExistente.titulo}`);
    res.json({
      success: true,
      message: 'Vídeo excluído com sucesso!',
      videoExcluido: {
        id: videoExistente.id,
        titulo: videoExistente.titulo
      }
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir vídeo');
  }
});

// ========== ROTAS DE DEBUG ========== //

app.get('/api/debug/curso/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    console.log(`🔍 Debug: Verificando curso ID: ${cursoId}...`);
    
    const curso = await prisma.curso.findUnique({
      where: { id: cursoId },
      include: {
        modulos: {
          include: { aulas: true }
        }
      }
    });

    if (!curso) {
      return res.json({ 
        exists: false,
        message: `Curso ${cursoId} não existe no banco de dados`
      });
    }

    res.json({
      exists: true,
      curso: {
        id: curso.id,
        titulo: curso.titulo,
        ativo: curso.ativo,
        totalModulos: curso.modulos.length,
        totalAulas: curso.modulos.reduce((acc, mod) => acc + mod.aulas.length, 0)
      },
      modulos: curso.modulos.map(mod => ({
        id: mod.id,
        titulo: mod.titulo,
        ativo: mod.ativo,
        aulas: mod.aulas.length
      }))
    });
  } catch (error) {
    handleError(res, error, 'Erro no debug');
  }
});

// ========== MANUSEIO DE ERROS ========== //

app.use((error, req, res, next) => {
  console.error('❌ Erro global:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: error.message
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// ========== INICIALIZAÇÃO DO SERVIDOR ========== //

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor Coliseum API...');
    
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados');
    
    app.listen(PORT, () => {
      console.log(`\n📍 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 URL: https://coliseum-api.onrender.com`);
      console.log(`\n🎯 ENDPOINTS PRINCIPAIS:`);
      
      // ========== SISTEMA DE CURSOS ========== //
      console.log(`\n📚 SISTEMA DE CURSOS:`);
      console.log(`✅  GET    /api/cursos              - Listar todos os cursos`);
      console.log(`✅  GET    /api/cursos/:id          - Buscar curso específico`);
      console.log(`✅  POST   /api/cursos              - Criar novo curso`);
      console.log(`✅  PUT    /api/cursos/:id          - Atualizar curso`);
      console.log(`✅  DELETE /api/cursos/:id          - Excluir curso (soft delete)`);
      console.log(`✅  GET    /api/cursos/:id/modulos  - Módulos do curso`);
      
      // ========== SISTEMA DE AULAS ========== //
      console.log(`\n🎓 SISTEMA DE AULAS:`);
      console.log(`✅  GET    /api/aulas               - Listar todas as aulas`);
      console.log(`✅  GET    /api/aulas/:id           - Detalhes da aula`);
      console.log(`✅  POST   /api/progresso/aula      - Marcar aula como concluída`);
      
      // ========== SISTEMA DE USUÁRIOS ========== //
      console.log(`\n👥 SISTEMA DE USUÁRIOS:`);
      console.log(`✅  POST   /api/usuarios            - Login/Cadastro de usuário`);
      console.log(`✅  PUT    /api/usuarios/:id        - Atualizar usuário`);
      console.log(`✅  DELETE /api/usuarios/:id        - Excluir usuário`);
      console.log(`✅  GET    /api/ranking             - Ranking de usuários`);
      
      // ========== SISTEMA DE VÍDEOS ========== //
      console.log(`\n🎬 SISTEMA DE VÍDEOS:`);
      console.log(`✅  GET    /api/videos              - Listar vídeos`);
      console.log(`✅  POST   /api/videos              - Adicionar vídeo`);
      console.log(`✅  PUT    /api/videos/:id          - Atualizar vídeo`);
      console.log(`✅  DELETE /api/videos/:id          - Excluir vídeo`);
      
      // ========== UTILITÁRIOS ========== //
      console.log(`\n🔧 UTILITÁRIOS:`);
      console.log(`✅  GET    /api/health              - Status do sistema`);
      console.log(`✅  GET    /api/debug/curso/:id     - Debug de curso`);
      console.log(`✅  GET    /                        - Status da API`);
      
      // ========== INFORMAÇÕES TÉCNICAS ========== //
      console.log(`\n🔧 INFORMAÇÕES TÉCNICAS:`);
      console.log(`📊 Banco de dados: PostgreSQL (Neon.tech)`);
      console.log(`🛠️  ORM: Prisma`);
      console.log(`🌐 CORS: Habilitado para múltiplas origens`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      console.log(`\n✨ API Coliseum totalmente operacional!`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();










