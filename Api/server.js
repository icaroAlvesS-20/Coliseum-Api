import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CONFIGURAÇÃO CORRIGIDA PARA NEON
const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
  datasourceUrl: process.env.DATABASE_URL + "?connection_limit=5&pool_timeout=30&connect_timeout=30",
});

// ✅ MIDDLEWARE DE RECONEXÃO
let connectionStatus = 'connected';

async function ensureConnection() {
  if (connectionStatus === 'connecting') return;

  try {
    connectionStatus = 'connecting';
    await prisma.$queryRaw`SELECT 1`;
    connectionStatus = 'connected';
  } catch (error) {
    console.log('🔄 Reconectando ao Neon...');
    try {
      await prisma.$disconnect();
      await prisma.$connect();
      connectionStatus = 'connected';
      console.log('✅ Reconectado ao Neon com sucesso');
    } catch (reconnectError) {
      console.error('❌ Falha crítica na reconexão:', reconnectError);
      connectionStatus = 'disconnected';
    }
  }
}

// ✅ CORS COMPLETO
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://coliseum-ebon.vercel.app',
      'https://coliseum-m71foc1um-icaroass-projects.vercel.app',
      'https://coliseum-peon87g6t-icaroass-projects.vercel.app',
      'https://coliseum-bigalfocm-icaroass-projects.vercel.app',
      /https:\/\/coliseum-.*\.vercel\.app$/,
      /https:\/\/.*-icaroass-projects\.vercel\.app$/,
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://127.0.0.1:3000',
      'https://coliseum-git-main-icaroass-projects.vercel.app'
    ];

    if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
    }

    if (allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') return origin === pattern;
      return pattern.test(origin);
    })) {
      return callback(null, true);
    }

    console.log('🚫 CORS bloqueado para:', origin);
    return callback(new Error('CORS não permitido'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

app.options('*', cors());
app.use(express.json());

// ========== MIDDLEWARE DE LOG ========== //
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// ========== ROTAS API ========== //

// ✅ ROTA RAIZ
app.get('/', (req, res) => {
    res.json({
        message: '🚀 API Coliseum Backend - Online',
        status: 'operational',
        environment: 'Render',
        database: 'Neon PostgreSQL',
        endpoints: {
            health: '/api/health',
            ranking: '/api/ranking',
            usuarios: '/api/usuarios (POST)',
            atualizar_usuario: '/api/usuarios/:id (PUT)',
            desafio_completo: '/api/desafio-completo (POST)',
            reset_usuarios: '/api/reset (DELETE)',
            debug: '/api/debug/persistence/:id',
            videos: '/api/videos (GET, POST, PUT, DELETE)',
            cursos: '/api/cursos (GET, POST, PUT, DELETE)',
            progresso: '/api/progresso (POST, GET)'
        },
        frontend: 'Repositório separado no Vercel',
        timestamp: new Date().toISOString()
    });
});

// ✅ HEALTH CHECK
app.get('/api/health', async (req, res) => {
    try {
        await ensureConnection();

        let totalUsuarios = 0;
        let totalVideos = 0;
        let totalCursos = 0;
        let databaseStatus = 'connected';

        try {
            totalUsuarios = await prisma.usuario.count();
        } catch (error) {
            databaseStatus = 'tables_missing';
            console.log('⚠️ Tabela de usuários não encontrada');
        }

        try {
            totalVideos = await prisma.video.count();
        } catch (error) {
            console.log('⚠️ Tabela de vídeos não encontrada');
        }

        try {
            totalCursos = await prisma.curso.count();
        } catch (error) {
            console.log('⚠️ Tabela de cursos não encontrada');
        }

        const databaseInfo = await prisma.$queryRaw`SELECT version() as postgres_version, current_database() as database_name, now() as server_time`;

        res.json({ 
            status: 'online', 
            environment: 'production',
            platform: 'Render',
            database: 'Neon PostgreSQL',
            totalUsuarios: totalUsuarios,
            totalVideos: totalVideos,
            totalCursos: totalCursos,
            databaseStatus: databaseStatus,
            databaseInfo: databaseInfo[0],
            connectionStatus: connectionStatus,
            timestamp: new Date().toISOString(),
            server: 'Coliseum API v3.0 - CURSOS SYSTEM'
        });
    } catch (error) {
        console.error('❌ Erro no health check:', error);
        res.status(500).json({ 
            error: 'Erro no banco de dados',
            details: error.message,
            connectionStatus: connectionStatus
        });
    }
});

// ✅ GET /api/ranking
app.get('/api/ranking', async (req, res) => {
    try {
        console.log('📊 Buscando ranking do banco real...');

        await ensureConnection();

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

        const rankingComPosicoes = usuarios.map((user, index) => ({
            ...user,
            posicao: index + 1
        }));

        console.log(`✅ Ranking carregado: ${rankingComPosicoes.length} usuários`);
        res.json(rankingComPosicoes);

    } catch (error) {
        console.error('❌ Erro ao buscar ranking:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar ranking',
            details: error.message 
        });
    }
});

// ✅ POST /api/usuarios - Login/Cadastro
app.post('/api/usuarios', async (req, res) => {
    try {
        const { ra, nome, senha, serie, action = 'login' } = req.body;

        console.log(`👤 Ação: ${action} para RA: ${ra}`);

        if (!ra) {
            return res.status(400).json({ error: 'RA é obrigatório' });
        }

        if (action === 'cadastro') {
            if (!nome || !senha || !serie) {
                return res.status(400).json({ 
                    error: 'Nome, senha e série são obrigatórios para cadastro' 
                });
            }

            try {
                await ensureConnection();

                const novoUsuario = await prisma.usuario.create({
                    data: {
                        ra: ra.toString().trim(),
                        nome: nome.trim(),
                        senha: senha,
                        serie: serie.toString().trim(),
                        pontuacao: 0,
                        desafiosCompletados: 0
                    },
                    select: {
                        id: true,
                        nome: true,
                        ra: true,
                        serie: true,
                        pontuacao: true,
                        desafiosCompletados: true
                    }
                });

                console.log(`✅ Novo usuário cadastrado: ${novoUsuario.nome}`);

                res.json({
                    success: true,
                    message: `Cadastro realizado com sucesso! Bem-vindo, ${nome}!`,
                    usuario: novoUsuario,
                    action: 'cadastro'
                });

            } catch (error) {
                if (error.code === 'P2002') {
                    return res.status(409).json({ 
                        error: 'RA já cadastrado no sistema' 
                    });
                }
                console.error('❌ Erro no cadastro:', error);
                res.status(500).json({ 
                    error: 'Erro ao cadastrar usuário',
                    details: error.message 
                });
            }

        } else {
            if (!senha) {
                return res.status(400).json({ error: 'Senha é obrigatória para login' });
            }

            await ensureConnection();

            const usuario = await prisma.usuario.findFirst({
                where: {
                    ra: ra.toString().trim(),
                    senha: senha
                },
                select: {
                    id: true,
                    nome: true,
                    ra: true,
                    serie: true,
                    pontuacao: true,
                    desafiosCompletados: true
                }
            });

            if (!usuario) {
                console.log(`❌ Login falhou para RA: ${ra}`);
                return res.status(401).json({ 
                    error: 'RA ou senha incorretos' 
                });
            }

            console.log(`✅ Login bem-sucedido: ${usuario.nome}`);

            res.json({
                success: true,
                message: `Login realizado! Bem-vindo de volta, ${usuario.nome}!`,
                usuario: usuario,
                action: 'login'
            });
        }

    } catch (error) {
        console.error('❌ Erro no processamento de usuário:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// ✅ PUT /api/usuarios/:id - Atualizar usuário
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, ra, serie, pontuacao, desafiosCompletados } = req.body;

        console.log(`🔄 [UPDATE COMPLETO] Usuário ${id}:`, { 
            nome, ra, serie, pontuacao, desafiosCompletados 
        });

        await ensureConnection();

        const usuarioAtualizado = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: {
                nome: nome,
                ra: ra,
                serie: serie,
                pontuacao: parseInt(pontuacao),
                desafiosCompletados: parseInt(desafiosCompletados),
            },
            select: {
                id: true,
                nome: true,
                ra: true,
                serie: true,
                pontuacao: true,
                desafiosCompletados: true
            }
        });

        console.log(`🎉 [SUCESSO TOTAL] Usuário ${id} atualizado:`, usuarioAtualizado);

        res.json({
            success: true,
            message: 'Usuário COMPLETAMENTE atualizado no banco!',
            usuario: usuarioAtualizado
        });

    } catch (error) {
        console.error('❌ [ERRO] Falha ao atualizar usuário:', error);
        res.status(500).json({ 
            success: false,
            error: 'FALHA ao atualizar usuário no banco',
            details: error.message
        });
    }
});

// ✅ POST /api/desafio-completo
app.post('/api/desafio-completo', async (req, res) => {
    try {
        const { usuarioId, pontuacaoGanha } = req.body;

        if (!usuarioId || !pontuacaoGanha) {
            return res.status(400).json({ error: 'usuarioId e pontuacaoGanha são obrigatórios' });
        }

        await ensureConnection();

        const usuario = await prisma.usuario.update({
            where: { id: parseInt(usuarioId) },
            data: {
                pontuacao: { increment: parseInt(pontuacaoGanha) },
                desafiosCompletados: { increment: 1 }
            },
            select: {
                id: true,
                nome: true,
                pontuacao: true,
                desafiosCompletados: true
            }
        });

        console.log(`🎯 Desafio completo registrado para usuário ${usuarioId}`);

        res.json({
            success: true,
            message: `Desafio completo! +${pontuacaoGanha} pontos`,
            usuario: usuario
        });

    } catch (error) {
        console.error('❌ Erro ao registrar desafio:', error);
        res.status(500).json({ 
            error: 'Erro ao registrar desafio',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/usuarios/:id - Excluir usuário específico
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🗑️ SOLICITAÇÃO: Excluir usuário ID: ${id}`);

        await ensureConnection();

        const usuario = await prisma.usuario.findUnique({
            where: { id: parseInt(id) }
        });

        if (!usuario) {
            console.log(`❌ Usuário ${id} não encontrado`);
            return res.status(404).json({ 
                success: false,
                error: 'Usuário não encontrado' 
            });
        }

        const usuarioExcluido = await prisma.usuario.delete({
            where: { id: parseInt(id) },
            select: {
                id: true,
                nome: true,
                ra: true,
                serie: true
            }
        });

        console.log(`✅ Usuário excluído: ${usuarioExcluido.nome} (ID: ${usuarioExcluido.id})`);

        res.json({
            success: true,
            message: `Usuário "${usuarioExcluido.nome}" excluído com sucesso!`,
            usuario: usuarioExcluido
        });

    } catch (error) {
        console.error('❌ Erro ao excluir usuário:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({ 
                success: false,
                error: 'Usuário não encontrado' 
            });
        }

        res.status(500).json({ 
            success: false,
            error: 'Erro ao excluir usuário',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/usuarios - Remove TODOS os usuários
app.delete('/api/usuarios', async (req, res) => {
    try {
        console.log('🗑️ SOLICITAÇÃO: Deletar TODOS os usuários');

        await ensureConnection();

        const result = await prisma.usuario.deleteMany({});

        console.log(`✅ TODOS os usuários removidos: ${result.count} registros deletados`);

        res.json({ 
            success: true, 
            message: `Todos os usuários foram removidos (${result.count} registros)`,
            registrosRemovidos: result.count
        });

    } catch (error) {
        console.error('❌ Erro ao deletar usuários:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao resetar banco de dados',
            details: error.message 
        });
    }
});

// ✅ POST /api/reset - Reset completo do banco
app.post('/api/reset', async (req, res) => {
    try {
        console.log('🔄 SOLICITAÇÃO: Reset completo do banco');

        await ensureConnection();

        const result = await prisma.usuario.deleteMany({});

        console.log(`✅ Banco resetado: ${result.count} usuários removidos`);

        res.json({ 
            success: true, 
            message: `Banco de dados resetado com sucesso! (${result.count} registros removidos)`,
            registrosRemovidos: result.count,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao resetar banco:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao resetar banco de dados',
            details: error.message 
        });
    }
});

// ========== ROTAS PARA VÍDEOS ========== //

// ✅ GET /api/videos - Listar todos os vídeos
app.get('/api/videos', async (req, res) => {
    try {
        await ensureConnection();

        const videos = await prisma.video.findMany({
            orderBy: { materia: 'asc' }
        });

        console.log(`✅ Vídeos carregados: ${videos.length} vídeos`);
        res.json(videos);

    } catch (error) {
        console.error('❌ Erro ao buscar vídeos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar vídeos',
            details: error.message 
        });
    }
});

// ✅ POST /api/videos - Adicionar novo vídeo
app.post('/api/videos', async (req, res) => {
    try {
        const { titulo, materia, categoria, url, descricao, duracao } = req.body;

        console.log(`🎬 Adicionando novo vídeo: ${titulo}`);

        if (!titulo || !materia || !categoria || !url || !duracao) {
            return res.status(400).json({
                success: false,
                error: 'Todos os campos obrigatórios devem ser preenchidos'
            });
        }

        await ensureConnection();

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

        console.log(`✅ Novo vídeo adicionado: ${novoVideo.titulo}`);

        res.json({
            success: true,
            message: 'Vídeo adicionado com sucesso!',
            video: novoVideo
        });

    } catch (error) {
        console.error('❌ Erro ao adicionar vídeo:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao adicionar vídeo',
            details: error.message 
        });
    }
});

// ✅ PUT /api/videos/:id - Atualizar vídeo
app.put('/api/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, materia, categoria, url, descricao, duracao } = req.body;

        console.log(`🎬 Atualizando vídeo ${id}: ${titulo}`);

        await ensureConnection();

        const videoExistente = await prisma.video.findUnique({
            where: { id: parseInt(id) }
        });

        if (!videoExistente) {
            return res.status(404).json({
                success: false,
                error: 'Vídeo não encontrado'
            });
        }

        const videoAtualizado = await prisma.video.update({
            where: { id: parseInt(id) },
            data: {
                titulo: titulo.trim(),
                materia: materia.trim(),
                categoria: categoria.trim(),
                url: url.trim(),
                descricao: descricao ? descricao.trim() : '',
                duracao: parseInt(duracao)
            }
        });

        console.log(`✅ Vídeo atualizado: ${videoAtualizado.titulo}`);

        res.json({
            success: true,
            message: 'Vídeo atualizado com sucesso!',
            video: videoAtualizado
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar vídeo:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar vídeo',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/videos/:id - Excluir vídeo
app.delete('/api/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🗑️ SOLICITAÇÃO: Excluir vídeo ID: ${id}`);

        await ensureConnection();

        const video = await prisma.video.findUnique({
            where: { id: parseInt(id) }
        });

        if (!video) {
            console.log(`❌ Vídeo ${id} não encontrado`);
            return res.status(404).json({ 
                success: false,
                error: 'Vídeo não encontrado' 
            });
        }

        const videoExcluido = await prisma.video.delete({
            where: { id: parseInt(id) }
        });

        console.log(`✅ Vídeo excluído: ${videoExcluido.titulo} (ID: ${videoExcluido.id})`);

        res.json({
            success: true,
            message: `Vídeo "${videoExcluido.titulo}" excluído com sucesso!`,
            video: videoExcluido
        });

    } catch (error) {
        console.error('❌ Erro ao excluir vídeo:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({ 
                success: false,
                error: 'Vídeo não encontrado' 
            });
        }

        res.status(500).json({ 
            success: false,
            error: 'Erro ao excluir vídeo',
            details: error.message 
        });
    }
});

// ========== ROTAS PARA CURSOS ========== //

// ✅ GET /api/cursos - Listar todos os cursos (CORRIGIDO)
app.get('/api/cursos', async (req, res) => {
    try {
        await ensureConnection();

        const cursos = await prisma.curso.findMany({
            where: { ativo: true },
            include: {
                modulos: {
                    include: {
                        aulas: true
                    }
                },
                progressos: true // Adicionado para contar alunos
            },
            orderBy: { materia: 'asc' }
        });

        // Formatar resposta corretamente para o frontend
        const cursosFormatados = cursos.map(curso => {
            const totalAlunos = curso.progressos ? curso.progressos.length : 0;
            const totalModulos = curso.modulos ? curso.modulos.length : 0;
            
            return {
                id: curso.id,
                titulo: curso.titulo,
                descricao: curso.descricao,
                materia: curso.materia,
                categoria: curso.categoria,
                nivel: curso.nivel,
                duracao: curso.duracao,
                imagem: curso.imagem,
                modulos: totalModulos,
                alunos: totalAlunos,
                avaliacao: 4.5, // Placeholder
                ativo: curso.ativo,
                criadoEm: curso.criadoEm
            };
        });

        console.log(`✅ Cursos carregados: ${cursosFormatados.length} cursos`);
        res.json(cursosFormatados);

    } catch (error) {
        console.error('❌ Erro ao buscar cursos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar cursos',
            details: error.message 
        });
    }
});

// ✅ POST /api/cursos - Criar novo curso
app.post('/api/cursos', async (req, res) => {
    try {
        const { titulo, descricao, materia, categoria, nivel, duracao, imagem } = req.body;

        console.log(`📚 Criando novo curso: ${titulo}`);

        if (!titulo || !materia || !categoria || !nivel || !duracao) {
            return res.status(400).json({
                success: false,
                error: 'Todos os campos obrigatórios devem ser preenchidos'
            });
        }

        await ensureConnection();

        const novoCurso = await prisma.curso.create({
            data: {
                titulo: titulo.trim(),
                descricao: descricao ? descricao.trim() : '',
                materia: materia.trim(),
                categoria: categoria.trim(),
                nivel: nivel.trim(),
                duracao: parseInt(duracao),
                imagem: imagem ? imagem.trim() : null,
                ativo: true
            }
        });

        console.log(`✅ Novo curso criado: ${novoCurso.titulo}`);

        res.json({
            success: true,
            message: 'Curso criado com sucesso!',
            curso: novoCurso
        });

    } catch (error) {
        console.error('❌ Erro ao criar curso:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao criar curso',
            details: error.message 
        });
    }
});

// ✅ PUT /api/cursos/:id - Atualizar curso
app.put('/api/cursos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo } = req.body;

        console.log(`📚 Atualizando curso ${id}: ${titulo}`);

        await ensureConnection();

        const cursoExistente = await prisma.curso.findUnique({
            where: { id: parseInt(id) }
        });

        if (!cursoExistente) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }

        const cursoAtualizado = await prisma.curso.update({
            where: { id: parseInt(id) },
            data: {
                titulo: titulo.trim(),
                descricao: descricao ? descricao.trim() : '',
                materia: materia.trim(),
                categoria: categoria.trim(),
                nivel: nivel.trim(),
                duracao: parseInt(duracao),
                imagem: imagem ? imagem.trim() : null,
                ativo: ativo !== undefined ? ativo : cursoExistente.ativo
            }
        });

        console.log(`✅ Curso atualizado: ${cursoAtualizado.titulo}`);

        res.json({
            success: true,
            message: 'Curso atualizado com sucesso!',
            curso: cursoAtualizado
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar curso:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar curso',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/cursos/:id - Excluir curso
app.delete('/api/cursos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🗑️ SOLICITAÇÃO: Excluir curso ID: ${id}`);

        await ensureConnection();

        const curso = await prisma.curso.findUnique({
            where: { id: parseInt(id) }
        });

        if (!curso) {
            console.log(`❌ Curso ${id} não encontrado`);
            return res.status(404).json({ 
                success: false,
                error: 'Curso não encontrado' 
            });
        }

        const cursoExcluido = await prisma.curso.delete({
            where: { id: parseInt(id) }
        });

        console.log(`✅ Curso excluído: ${cursoExcluido.titulo} (ID: ${cursoExcluido.id})`);

        res.json({
            success: true,
            message: `Curso "${cursoExcluido.titulo}" excluído com sucesso!`,
            curso: cursoExcluido
        });

    } catch (error) {
        console.error('❌ Erro ao excluir curso:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({ 
                success: false,
                error: 'Curso não encontrado' 
            });
        }

        res.status(500).json({ 
            success: false,
            error: 'Erro ao excluir curso',
            details: error.message 
        });
    }
});

// ✅ GET /api/cursos/:id - Buscar curso específico
app.get('/api/cursos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await ensureConnection();

        const curso = await prisma.curso.findUnique({
            where: { id: parseInt(id) },
            include: {
                modulos: {
                    include: {
                        aulas: {
                            orderBy: { ordem: 'asc' }
                        }
                    },
                    orderBy: { ordem: 'asc' }
                },
                progressos: true
            }
        });

        if (!curso) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }

        res.json({
            success: true,
            curso: curso
        });

    } catch (error) {
        console.error('❌ Erro ao buscar curso:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar curso',
            details: error.message 
        });
    }
});

// ========== ROTAS PARA PROGRESSO DE CURSOS ========== //

// ✅ GET /api/progresso/:usuarioId - Buscar progresso do usuário (CORRIGIDO)
app.get('/api/progresso/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;

        await ensureConnection();

        const progressos = await prisma.progressoCurso.findMany({
            where: { usuarioId: parseInt(usuarioId) },
            include: {
                curso: {
                    include: {
                        modulos: {
                            include: {
                                aulas: true
                            }
                        }
                    }
                }
            }
        });

        res.json({
            success: true,
            progressos: progressos
        });

    } catch (error) {
        console.error('❌ Erro ao buscar progresso:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar progresso',
            details: error.message 
        });
    }
});

// ✅ POST /api/progresso - Atualizar progresso do curso
app.post('/api/progresso', async (req, res) => {
    try {
        const { usuarioId, cursoId, progresso, ultimaAula, concluido } = req.body;

        if (!usuarioId || !cursoId) {
            return res.status(400).json({
                success: false,
                error: 'usuarioId e cursoId são obrigatórios'
            });
        }

        await ensureConnection();

        const progressoAtualizado = await prisma.progressoCurso.upsert({
            where: {
                usuarioId_cursoId: {
                    usuarioId: parseInt(usuarioId),
                    cursoId: parseInt(cursoId)
                }
            },
            update: {
                progresso: progresso !== undefined ? parseFloat(progresso) : undefined,
                ultimaAula: ultimaAula !== undefined ? parseInt(ultimaAula) : undefined,
                concluido: concluido !== undefined ? concluido : undefined
            },
            create: {
                usuarioId: parseInt(usuarioId),
                cursoId: parseInt(cursoId),
                progresso: progresso !== undefined ? parseFloat(progresso) : 0,
                ultimaAula: ultimaAula !== undefined ? parseInt(ultimaAula) : null,
                concluido: concluido !== undefined ? concluido : false
            }
        });

        console.log(`📊 Progresso atualizado - Usuário: ${usuarioId}, Curso: ${cursoId}, Progresso: ${progressoAtualizado.progresso}%`);

        res.json({
            success: true,
            message: 'Progresso atualizado com sucesso!',
            progresso: progressoAtualizado
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar progresso:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar progresso',
            details: error.message 
        });
    }
});

// ✅ GET /api/progresso/:usuarioId/:cursoId - Buscar progresso específico
app.get('/api/progresso/:usuarioId/:cursoId', async (req, res) => {
    try {
        const { usuarioId, cursoId } = req.params;

        await ensureConnection();

        const progresso = await prisma.progressoCurso.findUnique({
            where: {
                usuarioId_cursoId: {
                    usuarioId: parseInt(usuarioId),
                    cursoId: parseInt(cursoId)
                }
            },
            include: {
                curso: {
                    include: {
                        modulos: {
                            include: {
                                aulas: true
                            }
                        }
                    }
                }
            }
        });

        if (!progresso) {
            return res.json({
                success: true,
                progresso: null,
                message: 'Nenhum progresso encontrado para este curso'
            });
        }

        res.json({
            success: true,
            progresso: progresso
        });

    } catch (error) {
        console.error('❌ Erro ao buscar progresso específico:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar progresso',
            details: error.message 
        });
    }
});

// ========== ROTAS PARA MÓDULOS E AULAS ========== //

// ✅ GET /api/cursos/:cursoId/modulos - Listar módulos do curso
app.get('/api/cursos/:cursoId/modulos', async (req, res) => {
    try {
        const { cursoId } = req.params;

        await ensureConnection();

        const modulos = await prisma.modulo.findMany({
            where: { cursoId: parseInt(cursoId) },
            include: {
                aulas: {
                    orderBy: { ordem: 'asc' }
                }
            },
            orderBy: { ordem: 'asc' }
        });

        res.json({
            success: true,
            modulos: modulos
        });

    } catch (error) {
        console.error('❌ Erro ao buscar módulos:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar módulos',
            details: error.message 
        });
    }
});

// ✅ GET /api/modulos/:moduloId/aulas - Listar aulas do módulo
app.get('/api/modulos/:moduloId/aulas', async (req, res) => {
    try {
        const { moduloId } = req.params;

        await ensureConnection();

        const aulas = await prisma.aula.findMany({
            where: { moduloId: parseInt(moduloId) },
            orderBy: { ordem: 'asc' }
        });

        res.json({
            success: true,
            aulas: aulas
        });

    } catch (error) {
        console.error('❌ Erro ao buscar aulas:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao buscar aulas',
            details: error.message 
        });
    }
});

// ✅ ROTA DEBUG PARA VERIFICAR PERSISTÊNCIA
app.get('/api/debug/persistence/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await ensureConnection();

        const usuario = await prisma.usuario.findUnique({
            where: { id: parseInt(id) },
            select: {
                id: true,
                nome: true,
                ra: true,
                serie: true,
                pontuacao: true,
                desafiosCompletados: true,
                atualizadoEm: true,
                criadoEm: true
            }
        });

        console.log(`🔍 [DEBUG] Estado atual do usuário ${id}:`, usuario);

        res.json({
            success: true,
            usuario: usuario,
            connectionStatus: connectionStatus,
            message: 'Dados atuais do banco de dados',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Debug failed:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            connectionStatus: connectionStatus 
        });
    }
});

// ✅ ROTA DE FALLBACK PARA API
app.use('/api/*', (req, res) => {
    console.log(`❌ Rota API não encontrada: ${req.originalUrl}`);
    res.status(404).json({ 
        error: 'Endpoint API não encontrado',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: [
            'GET  /api/health',
            'GET  /api/ranking',
            'POST /api/usuarios',
            'PUT  /api/usuarios/:id',
            'POST /api/desafio-completo',
            'DELETE /api/usuarios/:id',
            'DELETE /api/usuarios (RESET)',
            'POST /api/reset (RESET)',
            'GET  /api/videos',
            'POST /api/videos',
            'PUT  /api/videos/:id',
            'DELETE /api/videos/:id',
            'GET  /api/cursos',
            'POST /api/cursos',
            'PUT  /api/cursos/:id',
            'DELETE /api/cursos/:id',
            'GET  /api/cursos/:id',
            'POST /api/progresso',
            'GET  /api/progresso/:usuarioId',
            'GET  /api/progresso/:usuarioId/:cursoId',
            'GET  /api/cursos/:cursoId/modulos',
            'GET  /api/modulos/:moduloId/aulas',
            'GET  /api/debug/persistence/:id'
        ]
    });
});

// ✅ ROTA DE FALLBACK GERAL
app.use('*', (req, res) => {
    res.json({
        message: '🚀 API Coliseum Backend - CURSOS SYSTEM',
        note: 'Frontend está em repositório separado',
        frontend_url: 'https://coliseum-ebon.vercel.app',
        api_endpoints: 'Acesse /api/health para status completo',
        version: '3.0 - Cursos Management'
    });
});

// ========== MANUTENÇÃO DE CONEXÃO ========== //

// ✅ MANTER CONEXÃO ATIVA A CADA 30 SEGUNDOS
setInterval(async () => {
    try {
        await ensureConnection();
    } catch (error) {
        console.log('💤 Manutenção de conexão falhou:', error.message);
    }
}, 30000);

// ========== FUNÇÕES AUXILIARES ========== //

// Função para adicionar cursos de exemplo
async function adicionarCursosExemplo() {
    try {
        const cursosExemplo = [
            {
                titulo: 'Álgebra Básica',
                descricao: 'Domine os conceitos fundamentais da álgebra incluindo equações, expressões e funções matemáticas.',
                materia: 'matematica',
                categoria: 'algebra',
                nivel: 'fundamental',
                duracao: 15,
                imagem: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400'
            },
            {
                titulo: 'Química Geral',
                descricao: 'Introdução aos conceitos básicos da química: elementos, compostos e reações químicas.',
                materia: 'csn',
                categoria: 'quimica',
                nivel: 'medio',
                duracao: 18,
                imagem: 'https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?w=400'
            },
            {
                titulo: 'História do Brasil',
                descricao: 'Panorama completo da história brasileira desde o descobrimento até a atualidade.',
                materia: 'csh',
                categoria: 'historia',
                nivel: 'medio',
                duracao: 16,
                imagem: 'https://images.unsplash.com/photo-1580137189272-c9379f8864fd?w=400'
            },
            {
                titulo: 'Gramática Completa',
                descricao: 'Domine todas as regras gramaticais da língua portuguesa.',
                materia: 'portugues',
                categoria: 'gramatica',
                nivel: 'medio',
                duracao: 22,
                imagem: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400'
            }
        ];

        for (const cursoData of cursosExemplo) {
            await prisma.curso.create({
                data: cursoData
            });
        }

        console.log(`✅ ${cursosExemplo.length} cursos de exemplo adicionados ao banco`);
    } catch (error) {
        console.log('⚠️ Não foi possível adicionar cursos de exemplo:', error.message);
    }
}

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        await ensureConnection();

        console.log('🔧 Verificando e criando tabelas...');
        
        // VERIFICAÇÃO ESPECÍFICA PARA TABELAS DE CURSOS
        try {
            // Tenta contar cursos - se falhar, as tabelas não existem
            await prisma.curso.count();
            console.log('✅ Tabelas de cursos já existem no banco');
        } catch (error) {
            if (error.code === 'P2021' || error.message.includes('does not exist')) {
                console.log('📦 Tabelas de cursos NÃO existem. Criando agora...');
                
                try {
                    // Força a criação das tabelas
                    const { execSync } = await import('child_process');
                    
                    console.log('🚀 Executando Prisma DB Push para criar tabelas...');
                    execSync('npx prisma db push --force-reset --accept-data-loss', { 
                        stdio: 'inherit' 
                    });
                    
                    console.log('✅ Todas as tabelas criadas com sucesso!');
                    
                    // Adiciona cursos de exemplo após criar as tabelas
                    await adicionarCursosExemplo();
                    
                } catch (pushError) {
                    console.error('❌ Erro crítico ao criar tabelas:', pushError);
                    console.log('🔄 Tentando abordagem alternativa...');
                    
                    // Abordagem alternativa: criar manualmente
                    try {
                        await criarTabelasManualmente();
                    } catch (manualError) {
                        console.error('❌ Falha total na criação de tabelas:', manualError);
                        throw manualError;
                    }
                }
            } else {
                throw error;
            }
        }

        // Agora conta os registros com tratamento de erro
        const totalUsuarios = await prisma.usuario.count().catch(() => 0);
        const totalVideos = await prisma.video.count().catch(() => 0);
        const totalCursos = await prisma.curso.count().catch(() => 0);

        console.log('✅ Conectado ao Neon PostgreSQL via Prisma');
        console.log(`👥 Total de usuários no banco: ${totalUsuarios}`);
        console.log(`🎬 Total de vídeos no banco: ${totalVideos}`);
        console.log(`📚 Total de cursos no banco: ${totalCursos}`);

        app.listen(PORT, () => {
            console.log('\n🚀🚀🚀 API COLISEUM - CURSOS ATIVOS! 🚀🚀🚀');
            console.log(`📍 Porta: ${PORT}`);
            console.log(`🌐 URL: https://coliseum-api.onrender.com`);
            console.log(`💾 Banco: Neon PostgreSQL`);
            console.log(`👥 Usuários: ${totalUsuarios}`);
            console.log(`🎬 Vídeos: ${totalVideos}`);
            console.log(`📚 Cursos: ${totalCursos}`);
            console.log(`🔧 Versão: 3.0 - CURSOS SYSTEM`);
            console.log(`\n📋 ENDPOINTS PRINCIPAIS:`);
            console.log(`   📚 GET  /api/cursos`);
            console.log(`   📚 POST /api/cursos`);
            console.log(`   📚 PUT  /api/cursos/:id`);
            console.log(`   📚 DELETE /api/cursos/:id`);
            console.log(`   📊 POST /api/progresso`);
            console.log(`   📊 GET  /api/progresso/:usuarioId`);
            console.log(`\n🎯 SISTEMA DE CURSOS COMPLETO!`);
        });

    } catch (error) {
        console.error('❌ Falha crítica ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Função alternativa para criar tabelas manualmente se o DB Push falhar
async function criarTabelasManualmente() {
    console.log('🛠️ Criando tabelas manualmente...');
    
    // Criação manual das tabelas via SQL raw
    try {
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS cursos (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descricao TEXT,
                materia VARCHAR(100) NOT NULL,
                categoria VARCHAR(100) NOT NULL,
                nivel VARCHAR(50) NOT NULL,
                duracao INTEGER NOT NULL,
                imagem VARCHAR(500),
                ativo BOOLEAN DEFAULT true,
                "criadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        console.log('✅ Tabela cursos criada');

        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS modulos (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descricao TEXT,
                ordem INTEGER NOT NULL,
                duracao INTEGER NOT NULL,
                "cursoId" INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
                "criadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        console.log('✅ Tabela modulos criada');

        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS aulas (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descricao TEXT,
                tipo VARCHAR(50) NOT NULL,
                conteudo TEXT,
                duracao INTEGER NOT NULL,
                ordem INTEGER NOT NULL,
                "moduloId" INTEGER REFERENCES modulos(id) ON DELETE CASCADE,
                "criadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        console.log('✅ Tabela aulas criada');

        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS progresso_cursos (
                id SERIAL PRIMARY KEY,
                "usuarioId" INTEGER NOT NULL,
                "cursoId" INTEGER NOT NULL,
                progresso FLOAT DEFAULT 0,
                concluido BOOLEAN DEFAULT false,
                "ultimaAula" INTEGER,
                "criadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE("usuarioId", "cursoId"),
                FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY ("cursoId") REFERENCES cursos(id) ON DELETE CASCADE
            )
        `;
        console.log('✅ Tabela progresso_cursos criada');

        console.log('🎉 Todas as tabelas criadas manualmente com sucesso!');
        
        // Adiciona cursos de exemplo
        await adicionarCursosExemplo();
        
    } catch (error) {
        console.error('❌ Erro na criação manual de tabelas:', error);
        throw error;
    }
}

startServer();

export default app;

