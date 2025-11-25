import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÕES ========== //

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
});

// ✅ CONFIGURAÇÃO CORS SIMPLIFICADA
const corsOptions = {
  origin: [
    'https://coliseum-frontend.vercel.app',
    'https://coliseum-icaroass-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Middleware de log
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`, req.body || req.query);
  next();
});

// ========== UTILITÁRIOS ========== //

const validateId = (id) => {
  const numId = parseInt(id);
  return !isNaN(numId) ? numId : null;
};

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

// ========== SISTEMA DE USUÁRIOS ========== //

// ✅ ROTA GET /api/usuarios (APENAS UMA)
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
        criadoEm: true,
        atualizadoEm: true
      },
      orderBy: { criadoEm: 'desc' }
    });

    console.log(`✅ ${usuarios.length} usuários carregados via /api/usuarios`);
    
    res.json(usuarios);
  } catch (error) {
    console.error('❌ Erro ao carregar usuários:', error);
    res.status(500).json({ 
      error: 'Erro ao carregar usuários',
      details: error.message 
    });
  }
});

// ✅ ROTA POST /api/usuarios (CADASTRAR NOVO USUÁRIO)
app.post('/api/usuarios', async (req, res) => {
  try {
    const { nome, ra, serie, senha, curso, action } = req.body;

    console.log('📝 Recebendo dados para cadastro:', { nome, ra, serie, curso, action });

    // Validação dos campos obrigatórios
    if (!nome || !ra || !serie || !senha || !curso) {
      return res.status(400).json({
        error: 'Dados incompletos',
        required: ['nome', 'ra', 'serie', 'senha', 'curso']
      });
    }

    // Verificar se RA já existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { ra: ra.toString().trim() }
    });

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'RA já cadastrado no sistema',
        details: `O RA ${ra} já está em uso por outro usuário.`
      });
    }

    // Criar novo usuário
    const novoUsuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        ra: ra.toString().trim(),
        serie: serie.trim(),
        senha: senha.trim(), // Em produção, isso deve ser hash!
        curso: curso.trim(),
        pontuacao: 0,
        desafiosCompletados: 0,
        criadoEm: new Date(),
        atualizadoEm: new Date()
      }
    });

    console.log('✅ Usuário criado com sucesso:', novoUsuario);

    // Retornar dados sem a senha
    const { senha: _, ...usuarioSemSenha } = novoUsuario;

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso!',
      usuario: usuarioSemSenha
    });

  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'RA já cadastrado no sistema'
      });
    }
    
    handleError(res, error, 'Erro ao criar usuário');
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

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const userId = validateId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const { nome, ra, serie, curso, pontuacao, desafiosCompletados } = req.body;
    console.log(`✏️ Atualizando usuário ID: ${userId}`, req.body);

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const updateData = { 
      atualizadoEm: new Date(),
      nome: nome ? nome.trim() : usuarioExistente.nome,
      ra: ra ? ra.toString().trim() : usuarioExistente.ra,
      serie: serie ? serie.trim() : usuarioExistente.serie,
      curso: curso ? curso.trim() : usuarioExistente.curso,
      pontuacao: pontuacao !== undefined ? parseInt(pontuacao) : usuarioExistente.pontuacao,
      desafiosCompletados: desafiosCompletados !== undefined ? parseInt(desafiosCompletados) : usuarioExistente.desafiosCompletados
    };

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

// ========== SISTEMA DE CURSOS ========== //

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
        }
      }
    });

    if (!curso) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    res.json(curso);
  } catch (error) {
    handleError(res, error, 'Erro ao carregar curso');
  }
});

app.post('/api/cursos', async (req, res) => {
  try {
    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo, modulos } = req.body;

    if (!titulo || !materia || !categoria || !nivel || !duracao) {
      return res.status(400).json({ 
        error: 'Dados incompletos',
        required: ['titulo', 'materia', 'categoria', 'nivel', 'duracao']
      });
    }

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
          ativo: ativo !== undefined ? ativo : true
        }
      });

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

      return await tx.curso.findUnique({
        where: { id: curso.id },
        include: {
          modulos: {
            include: { aulas: true }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      message: 'Curso criado com sucesso!',
      curso: novoCurso
    });
  } catch (error) {
    handleError(res, error, 'Erro ao criar curso');
  }
});

app.put('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) return res.status(400).json({ error: 'ID do curso inválido' });

    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo } = req.body;
    
    const cursoExistente = await prisma.curso.findUnique({ where: { id: cursoId } });
    if (!cursoExistente) return res.status(404).json({ error: 'Curso não encontrado' });

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

app.delete('/api/cursos/:id', async (req, res) => {
  try {
    const cursoId = validateId(req.params.id);
    if (!cursoId) return res.status(400).json({ error: 'ID do curso inválido' });

    const cursoExistente = await prisma.curso.findUnique({ where: { id: cursoId } });
    if (!cursoExistente) return res.status(404).json({ error: 'Curso não encontrado' });

    await prisma.curso.update({
      where: { id: cursoId },
      data: { ativo: false, atualizadoEm: new Date() }
    });

    res.json({
      success: true,
      message: 'Curso excluído com sucesso!'
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir curso');
  }
});

// ========== SISTEMA DE VÍDEOS ========== //

app.get('/api/videos', async (req, res) => {
  try {
    const videos = await prisma.video.findMany({ orderBy: { materia: 'asc' } });
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
    if (!videoId) return res.status(400).json({ error: 'ID do vídeo inválido' });

    const { titulo, materia, categoria, url, descricao, duracao } = req.body;
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
    if (!videoId) return res.status(400).json({ error: 'ID do vídeo inválido' });

    const videoExistente = await prisma.video.findUnique({ where: { id: videoId } });
    if (!videoExistente) return res.status(404).json({ error: 'Vídeo não encontrado' });

    await prisma.video.delete({ where: { id: videoId } });

    res.json({
      success: true,
      message: 'Vídeo excluído com sucesso!'
    });
  } catch (error) {
    handleError(res, error, 'Erro ao excluir vídeo');
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
