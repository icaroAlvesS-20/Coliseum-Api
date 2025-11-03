// server.js - ATUALIZADO E CORRIGIDO
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CONFIGURAÇÃO DO PRISMA
const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
});

// ✅ CORS CONFIGURADO
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// ========== MIDDLEWARE DE LOG ========== //
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`, req.query);
    next();
});

// ========== ROTAS PRINCIPAIS ========== //

app.get('/', (req, res) => {
    res.json({
        message: '🚀 API Coliseum Backend - Online',
        status: 'operational',
        timestamp: new Date().toISOString()
    });
});

// ✅ HEALTH CHECK MELHORADO
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        
        const totalUsuarios = await prisma.usuario.count().catch(() => 0);
        const totalVideos = await prisma.video.count().catch(() => 0);
        const totalCursos = await prisma.curso.count().catch(() => 0);
        const totalAulas = await prisma.aula.count().catch(() => 0);

        res.json({ 
            status: 'online',
            database: 'connected',
            totalUsuarios,
            totalVideos,
            totalCursos,
            totalAulas,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            database: 'disconnected',
            error: 'Database error' 
        });
    }
});

// ========== SISTEMA DE CURSOS - CORRIGIDO ========== //

// ✅ GET /api/cursos - LISTAR TODOS OS CURSOS (CORRIGIDO)
app.get('/api/cursos', async (req, res) => {
    try {
        console.log('📚 Buscando todos os cursos...');

        const cursos = await prisma.curso.findMany({
            where: { ativo: true },
            include: {
                modulos: {
                    include: {
                        aulas: {
                            where: { ativo: true },
                            orderBy: { ordem: 'asc' }
                        }
                    },
                    where: { ativo: true },
                    orderBy: { ordem: 'asc' }
                }
            },
            orderBy: { criadoEm: 'desc' }
        });

        console.log(`✅ ${cursos.length} cursos carregados`);
        
        // Formatar resposta para garantir compatibilidade
        const cursosFormatados = cursos.map(curso => ({
            id: curso.id,
            titulo: curso.titulo,
            descricao: curso.descricao,
            imagem: curso.imagem,
            ativo: curso.ativo,
            criadoEm: curso.criadoEm,
            modulos: curso.modulos || []
        }));

        res.json(cursosFormatados);

    } catch (error) {
        console.error('❌ Erro ao buscar cursos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar cursos',
            details: error.message 
        });
    }
});

// ✅ GET /api/cursos/:id - CURSO ESPECÍFICO (CORRIGIDO)
app.get('/api/cursos/:id', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        console.log(`🎯 Buscando curso específico ID: ${cursoId}`);

        if (isNaN(cursoId)) {
            return res.status(400).json({ error: 'ID do curso inválido' });
        }

        const curso = await prisma.curso.findUnique({
            where: { 
                id: cursoId,
                ativo: true 
            },
            include: {
                modulos: {
                    include: {
                        aulas: {
                            where: { ativo: true },
                            orderBy: { ordem: 'asc' },
                            include: {
                                progressos: {
                                    where: { 
                                        usuarioId: req.query.usuarioId ? parseInt(req.query.usuarioId) : undefined 
                                    }
                                }
                            }
                        }
                    },
                    where: { ativo: true },
                    orderBy: { ordem: 'asc' }
                }
            }
        });

        if (!curso) {
            console.log(`❌ Curso ${cursoId} não encontrado ou inativo`);
            return res.status(404).json({ 
                error: 'Curso não encontrado',
                cursoId: cursoId
            });
        }

        console.log(`✅ Curso encontrado: ${curso.titulo} com ${curso.modulos?.length || 0} módulos`);
        
        // Formatar resposta
        const cursoFormatado = {
            ...curso,
            modulos: curso.modulos || []
        };

        res.json(cursoFormatado);

    } catch (error) {
        console.error('❌ Erro ao buscar curso:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar curso',
            details: error.message 
        });
    }
});

// ✅ GET /api/cursos/:id/modulos - MÓDULOS DO CURSO (CORRIGIDO)
app.get('/api/cursos/:cursoId/modulos', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.cursoId);
        const usuarioId = req.query.usuarioId ? parseInt(req.query.usuarioId) : null;
        
        console.log(`📂 Buscando módulos do curso ${cursoId}, usuário: ${usuarioId}`);

        if (isNaN(cursoId)) {
            return res.status(400).json({ error: 'ID do curso inválido' });
        }

        // Verificar se o curso existe
        const cursoExiste = await prisma.curso.findFirst({
            where: { 
                id: cursoId,
                ativo: true 
            },
            select: { id: true }
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

        console.log(`✅ ${modulos.length} módulos carregados com ${modulos.reduce((acc, mod) => acc + mod.aulas.length, 0)} aulas`);
        
        // Se não há módulos, retornar array vazio em vez de erro
        res.json(modulos || []);

    } catch (error) {
        console.error('❌ Erro ao buscar módulos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar módulos',
            details: error.message 
        });
    }
});

// ✅ ROTA ALTERNATIVA PARA COMPATIBILIDADE
app.get('/api/cursos/:id/modulos', async (req, res) => {
    // Redirecionar para a rota correta
    const cursoId = req.params.id;
    console.log(`🔄 Redirecionando rota antiga para nova: /api/cursos/${cursoId}/modulos`);
    
    // Manter os query parameters
    const queryParams = new URLSearchParams(req.query).toString();
    const redirectUrl = `/api/cursos/${cursoId}/modulos${queryParams ? '?' + queryParams : ''}`;
    
    res.redirect(307, redirectUrl);
});

// ✅ GET /api/aulas/:id - DETALHES DA AULA (CORRIGIDO)
app.get('/api/aulas/:id', async (req, res) => {
    try {
        const aulaId = parseInt(req.params.id);
        const usuarioId = req.query.usuarioId ? parseInt(req.query.usuarioId) : null;
        
        console.log(`🎓 Buscando aula ${aulaId}, usuário: ${usuarioId}`);

        if (isNaN(aulaId)) {
            return res.status(400).json({ error: 'ID da aula inválido' });
        }

        const aula = await prisma.aula.findUnique({
            where: { 
                id: aulaId,
                ativo: true 
            },
            include: {
                modulo: {
                    include: {
                        curso: true
                    }
                },
                progressos: usuarioId ? {
                    where: { usuarioId: usuarioId }
                } : false
            }
        });

        if (!aula) {
            return res.status(404).json({ 
                error: 'Aula não encontrada',
                aulaId: aulaId
            });
        }

        res.json(aula);

    } catch (error) {
        console.error('❌ Erro ao buscar aula:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar aula',
            details: error.message 
        });
    }
});

// ✅ POST /api/progresso/aula - MARCAR AULA COMO CONCLUÍDA (CORRIGIDO)
app.post('/api/progresso/aula', async (req, res) => {
    try {
        const { usuarioId, aulaId, cursoId } = req.body;
        console.log(`📊 Registrando progresso - Usuário: ${usuarioId}, Aula: ${aulaId}, Curso: ${cursoId}`);

        if (!usuarioId || !aulaId || !cursoId) {
            return res.status(400).json({ 
                error: 'Dados incompletos',
                required: ['usuarioId', 'aulaId', 'cursoId']
            });
        }

        // Verificar se a aula existe
        const aulaExiste = await prisma.aula.findFirst({
            where: { 
                id: aulaId,
                ativo: true 
            }
        });

        if (!aulaExiste) {
            return res.status(404).json({ error: 'Aula não encontrada' });
        }

        // Marca aula como concluída
        const progressoAula = await prisma.progressoAula.upsert({
            where: {
                usuarioId_aulaId: {
                    usuarioId: usuarioId,
                    aulaId: aulaId
                }
            },
            update: {
                concluida: true,
                dataConclusao: new Date(),
                cursoId: cursoId
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
            where: { 
                modulo: { 
                    cursoId: cursoId 
                },
                ativo: true
            }
        });

        const aulasConcluidas = await prisma.progressoAula.count({
            where: { 
                usuarioId: usuarioId,
                cursoId: cursoId,
                concluida: true
            }
        });

        const progressoCurso = totalAulas > 0 ? Math.round((aulasConcluidas / totalAulas) * 100) : 0;

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
                ultimaAula: aulaId,
                atualizadoEm: new Date()
            },
            create: {
                usuarioId: usuarioId,
                cursoId: cursoId,
                progresso: progressoCurso,
                concluido: progressoCurso >= 100,
                ultimaAula: aulaId,
                atualizadoEm: new Date()
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
            details: error.message 
        });
    }
});

// ========== NOVAS ROTAS UTILITÁRIAS ========== //

// ✅ GET /api/status - STATUS COMPLETO DA API
app.get('/api/status', async (req, res) => {
    try {
        const dbStatus = await prisma.$queryRaw`SELECT 1`.then(() => 'connected').catch(() => 'disconnected');
        
        const stats = await Promise.all([
            prisma.curso.count().catch(() => 0),
            prisma.modulo.count().catch(() => 0),
            prisma.aula.count().catch(() => 0),
            prisma.usuario.count().catch(() => 0)
        ]);

        res.json({
            api: 'online',
            database: dbStatus,
            timestamp: new Date().toISOString(),
            statistics: {
                cursos: stats[0],
                modulos: stats[1],
                aulas: stats[2],
                usuarios: stats[3]
            },
            endpoints: {
                cursos: '/api/cursos',
                cursoDetalhes: '/api/cursos/:id', 
                modulos: '/api/cursos/:cursoId/modulos',
                aulas: '/api/aulas/:id',
                progresso: '/api/progresso/aula'
            }
        });

    } catch (error) {
        res.status(500).json({ 
            api: 'error',
            error: error.message 
        });
    }
});

// ✅ ROTA DE FALLBACK PARA ERROS 404
app.use('/api/*', (req, res) => {
    console.log(`❌ Rota não encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.originalUrl,
        availableEndpoints: [
            'GET /api/cursos',
            'GET /api/cursos/:id',
            'GET /api/cursos/:cursoId/modulos',
            'GET /api/aulas/:id',
            'POST /api/progresso/aula',
            'GET /api/health',
            'GET /api/status'
        ]
    });
});

// ========== ROTAS EXISTENTES (MANTIDAS) ========== //

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

        res.json(usuarios);

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

// ✅ VÍDEOS
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
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🎯 Rotas de cursos: ✅ ATIVAS`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
            console.log(`📈 Status completo: http://localhost:${PORT}/api/status`);
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

startServer();

export default app;
