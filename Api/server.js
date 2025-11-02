import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CONFIGURAÇÃO DO PRISMA
const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
  datasourceUrl: process.env.DATABASE_URL + "?connection_limit=5&pool_timeout=30&connect_timeout=30",
});

// ✅ CORS CONFIGURADO
app.use(cors({
  origin: [
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
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// ========== MIDDLEWARE DE LOG ========== //
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// ========== ROTAS PRINCIPAIS ========== //

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
            cursos: '/api/cursos (GET, POST, PUT, DELETE)',
            modulos: '/api/cursos/:id/modulos (GET)',
            aulas: '/api/aulas/:id (GET)',
            progresso: '/api/progresso/aula (POST)',
            videos: '/api/videos (GET, POST, PUT, DELETE)'
        },
        timestamp: new Date().toISOString()
    });
});

// ✅ HEALTH CHECK
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        
        const totalUsuarios = await prisma.usuario.count().catch(() => 0);
        const totalVideos = await prisma.video.count().catch(() => 0);
        const totalCursos = await prisma.curso.count().catch(() => 0);

        res.json({ 
            status: 'online',
            totalUsuarios,
            totalVideos,
            totalCursos,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ========== SISTEMA COMPLETO DE CURSOS ========== //

// ✅ GET /api/cursos - LISTAR CURSOS
app.get('/api/cursos', async (req, res) => {
    try {
        console.log('📚 Buscando cursos...');

        const cursos = await prisma.curso.findMany({
            where: { ativo: true },
            include: {
                modulos: {
                    include: {
                        _count: {
                            select: { aulas: true }
                        }
                    }
                },
                progressos: true
            },
            orderBy: { criadoEm: 'desc' }
        });

        const cursosFormatados = cursos.map(curso => ({
            id: curso.id,
            titulo: curso.titulo,
            descricao: curso.descricao,
            materia: curso.materia,
            categoria: curso.categoria,
            nivel: curso.nivel,
            duracao: curso.duracao,
            imagem: curso.imagem,
            modulos: curso.modulos.length,
            aulas: curso.modulos.reduce((total, modulo) => total + modulo._count.aulas, 0),
            alunos: curso.progressos.length,
            avaliacao: 4.5, // Placeholder
            ativo: curso.ativo
        }));

        console.log(`✅ ${cursosFormatados.length} cursos carregados`);
        res.json(cursosFormatados);

    } catch (error) {
        console.error('❌ Erro ao buscar cursos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar cursos',
            details: error.message 
        });
    }
});

// ✅ POST /api/cursos - CRIAR CURSO
app.post('/api/cursos', async (req, res) => {
    try {
        const { titulo, descricao, materia, categoria, nivel, duracao, imagem } = req.body;

        console.log('📝 Criando curso:', titulo);

        if (!titulo || !materia || !categoria || !nivel || !duracao) {
            return res.status(400).json({
                success: false,
                error: 'Todos os campos obrigatórios devem ser preenchidos'
            });
        }

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

        console.log(`✅ Curso criado: ${novoCurso.titulo}`);
        
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

// ✅ GET /api/cursos/:id/modulos - MÓDULOS DO CURSO
app.get('/api/cursos/:id/modulos', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        console.log(`📂 Buscando módulos do curso ${cursoId}`);
        
        const modulos = await prisma.modulo.findMany({
            where: { cursoId: cursoId },
            include: {
                aulas: {
                    orderBy: { ordem: 'asc' },
                    include: {
                        progressos: {
                            where: { usuarioId: req.query.usuarioId ? parseInt(req.query.usuarioId) : 0 }
                        }
                    }
                }
            },
            orderBy: { ordem: 'asc' }
        });

        console.log(`✅ ${modulos.length} módulos carregados`);
        res.json(modulos);

    } catch (error) {
        console.error('❌ Erro ao buscar módulos:', error);
        res.status(500).json({ error: 'Erro ao carregar módulos' });
    }
});

// ✅ GET /api/aulas/:id - DETALHES DA AULA
app.get('/api/aulas/:id', async (req, res) => {
    try {
        const aulaId = parseInt(req.params.id);
        console.log(`🎓 Buscando aula ${aulaId}`);
        
        const aula = await prisma.aula.findUnique({
            where: { id: aulaId },
            include: {
                modulo: {
                    include: {
                        curso: true
                    }
                },
                progressos: {
                    where: { usuarioId: req.query.usuarioId ? parseInt(req.query.usuarioId) : 0 }
                }
            }
        });

        if (!aula) {
            return res.status(404).json({ error: 'Aula não encontrada' });
        }

        // Próxima aula
        const proximaAula = await prisma.aula.findFirst({
            where: {
                moduloId: aula.moduloId,
                ordem: { gt: aula.ordem }
            },
            orderBy: { ordem: 'asc' }
        });

        res.json({
            ...aula,
            proximaAula: proximaAula ? { id: proximaAula.id, titulo: proximaAula.titulo } : null
        });

    } catch (error) {
        console.error('❌ Erro ao buscar aula:', error);
        res.status(500).json({ error: 'Erro ao carregar aula' });
    }
});

// ✅ POST /api/progresso/aula - MARCAR AULA COMO CONCLUÍDA
app.post('/api/progresso/aula', async (req, res) => {
    try {
        const { usuarioId, aulaId, cursoId } = req.body;
        console.log(`📊 Registrando progresso - Usuário: ${usuarioId}, Aula: ${aulaId}`);

        if (!usuarioId || !aulaId || !cursoId) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        // Marca aula como concluída
        await prisma.progressoAula.upsert({
            where: {
                usuarioId_aulaId: {
                    usuarioId: usuarioId,
                    aulaId: aulaId
                }
            },
            update: {
                concluida: true,
                dataConclusao: new Date()
            },
            create: {
                usuarioId: usuarioId,
                aulaId: aulaId,
                cursoId: cursoId,
                concluida: true,
                dataConclusao: new Date()
            }
        });

        // Calcula progresso do curso
        const totalAulas = await prisma.aula.count({
            where: { modulo: { cursoId: cursoId } }
        });

        const aulasConcluidas = await prisma.progressoAula.count({
            where: { 
                usuarioId: usuarioId,
                cursoId: cursoId,
                concluida: true
            }
        });

        const progressoCurso = Math.round((aulasConcluidas / totalAulas) * 100);

        // Atualiza progresso do curso
        await prisma.progressoCurso.upsert({
            where: {
                usuarioId_cursoId: {
                    usuarioId: usuarioId,
                    cursoId: cursoId
                }
            },
            update: {
                progresso: progressoCurso,
                concluido: progressoCurso >= 100,
                ultimaAula: aulaId
            },
            create: {
                usuarioId: usuarioId,
                cursoId: cursoId,
                progresso: progressoCurso,
                concluido: progressoCurso >= 100,
                ultimaAula: aulaId
            }
        });

        console.log(`✅ Progresso atualizado: ${progressoCurso}%`);

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
        res.status(500).json({ error: 'Erro ao salvar progresso' });
    }
});

// ✅ GET /api/progresso/:usuarioId - PROGRESSO DO USUÁRIO
app.get('/api/progresso/:usuarioId', async (req, res) => {
    try {
        const usuarioId = parseInt(req.params.id);
        
        const progressos = await prisma.progressoCurso.findMany({
            where: { usuarioId: usuarioId },
            include: {
                curso: true
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
            error: 'Erro ao buscar progresso'
        });
    }
});

// ========== ROTAS EXISTENTES (MANTIDAS) ========== //

// ... (mantenha as rotas de ranking, usuarios, videos que você já tem)

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
            orderBy: { pontuacao: 'desc' }
        });

        const rankingComPosicoes = usuarios.map((user, index) => ({
            ...user,
            posicao: index + 1
        }));

        res.json(rankingComPosicoes);

    } catch (error) {
        console.error('❌ Erro ao buscar ranking:', error);
        res.status(500).json({ error: 'Erro ao carregar ranking' });
    }
});

// ✅ USUÁRIOS
app.post('/api/usuarios', async (req, res) => {
    try {
        const { ra, nome, senha, serie, action = 'login' } = req.body;

        if (action === 'cadastro') {
            if (!nome || !senha || !serie) {
                return res.status(400).json({ error: 'Nome, senha e série são obrigatórios' });
            }

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
            if (!senha) {
                return res.status(400).json({ error: 'Senha é obrigatória' });
            }

            const usuario = await prisma.usuario.findFirst({
                where: {
                    ra: ra.toString().trim(),
                    senha: senha
                }
            });

            if (!usuario) {
                return res.status(401).json({ error: 'RA ou senha incorretos' });
            }

            res.json({
                success: true,
                message: `Login realizado! Bem-vindo de volta, ${usuario.nome}!`,
                usuario: usuario
            });
        }

    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'RA já cadastrado' });
        }
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ✅ VÍDEOS (mantenha suas rotas existentes)
app.get('/api/videos', async (req, res) => {
    try {
        const videos = await prisma.video.findMany({
            orderBy: { materia: 'asc' }
        });
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar vídeos' });
    }
});

app.post('/api/videos', async (req, res) => {
    try {
        const { titulo, materia, categoria, url, descricao, duracao } = req.body;

        if (!titulo || !materia || !categoria || !url || !duracao) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
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
        res.status(500).json({ error: 'Erro ao adicionar vídeo' });
    }
});

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        console.log('🚀 Iniciando servidor Coliseum API...');
        
        await prisma.$connect();
        console.log('✅ Conectado ao banco de dados');
        
        app.listen(PORT, () => {
            console.log(`\n📍 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 URL: https://coliseum-api.onrender.com`);
            console.log(`📚 Sistema de cursos: ✅ COMPLETO`);
        });

    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Desligando servidor...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Desligando servidor (SIGTERM)...');
    await prisma.$disconnect();
    process.exit(0);
});

startServer();

export default app;
