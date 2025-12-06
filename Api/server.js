 import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

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
  }
});

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
    // Permitir requests sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    // Verificar se a origin está na lista ou é um subdomínio Vercel
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

// ✅ MIDDLEWARE PARA OPTIONS (pré-flight)
app.options('*', cors());

// ✅ MIDDLEWARE PARA PARSING JSON
app.use(express.json({ 
  limit: '10mb'
}));

// ✅ MIDDLEWARE DE LOG
app.use((req, res, next) => {
  console.log(`\n=== NOVA REQUISIÇÃO ===`);
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  console.log('📍 Origin:', req.headers.origin);
  console.log('📦 Body:', req.body);
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
  
  res.status(500).json({ 
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
  });
};

// ========== CONEXÃO COM BANCO ========== //

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

// ========== ROTAS BÁSICAS ========== //

app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Coliseum Backend - Online',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'connected'
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
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

        // ✅ VALIDAÇÃO
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

        // ✅ VALIDAÇÃO DO RA (4 dígitos)
        if (!/^\d{4}$/.test(ra.toString().trim())) {
            return res.status(400).json({
                error: 'RA inválido',
                details: 'O RA deve conter exatamente 4 dígitos numéricos'
            });
        }

        // ✅ Verificar se RA já existe
        const usuarioExistente = await prisma.usuario.findUnique({
            where: { ra: ra.toString().trim() }
        });

        if (usuarioExistente) {
            return res.status(409).json({
                error: 'RA já cadastrado no sistema',
                details: `O RA ${ra} já está em uso por outro usuário.`
            });
        }

        // ✅ Criar novo usuário
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

        // ✅ Retornar dados sem a senha
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

        // ✅ VERIFICAR SENHA
        if (usuario.senha !== senha.trim()) {
            console.log('❌ Senha incorreta para usuário:', usuario.nome);
            return res.status(401).json({
                success: false,
                error: 'Senha incorreta'
            });
        }

        console.log('✅ Login bem-sucedido para:', usuario.nome);

        // ✅ RETORNAR DADOS DO USUÁRIO (sem a senha)
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

    // ✅ VALIDAÇÃO: Verificar se novo RA já existe (se foi alterado)
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

// ========== SISTEMA DE DESAFIOS (CRUD) ========== //

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

// ========== SISTEMA DE CURSOS ========== //

// ✅ GET TODOS OS CURSOS
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

// ✅ POST CRIAR CURSO
app.post('/api/cursos', async (req, res) => {
  try {
    const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo, modulos } = req.body;

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

      if (modulos && Array.isArray(modulos)) {
        for (const moduloData of modulos) {
          if (!moduloData.titulo) continue;
          
          const modulo = await tx.modulo.create({
            data: {
              titulo: moduloData.titulo.trim(),
              descricao: moduloData.descricao?.trim() || '',
              ordem: moduloData.ordem || 1,
              cursoId: curso.id,
              ativo: true
            }
          });

          if (moduloData.aulas && Array.isArray(moduloData.aulas)) {
            for (const aulaData of moduloData.aulas) {
              if (!aulaData.titulo) continue;
              
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

// ========== SISTEMA DE VÍDEOS ========== //

// ✅ GET TODOS OS VÍDEOS
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
        titulo: titulo.trim(),
        materia: materia.trim(),
        categoria: categoria.trim(),
        url: url.trim(),
        descricao: descricao ? descricao.trim() : '',
        duracao: parseInt(duracao)
      }
    });

    res.status(201).json({
      success: true,
      message: 'Vídeo adicionado com sucesso!',
      video: novoVideo
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
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n📍 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🌐 Production: https://coliseum-api.onrender.com`);
            console.log(`\n✨ API Coliseum totalmente operacional!`);
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
