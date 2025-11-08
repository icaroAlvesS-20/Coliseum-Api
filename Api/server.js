// server.js - COMPLETO E CORRIGIDO
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

// ========== SISTEMA DE CURSOS - CORRIGIDO ========== //

// ✅ GET /api/cursos - LISTAR TODOS OS CURSOS
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
        res.json(cursos);

    } catch (error) {
        console.error('❌ Erro ao buscar cursos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar cursos',
            details: error.message 
        });
    }
});

// ✅ GET /api/cursos/:id - CURSO ESPECÍFICO (CORREÇÃO CRÍTICA)
app.get('/api/cursos/:id', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        console.log(`🎯 Buscando curso específico ID: ${cursoId}`);

        if (isNaN(cursoId)) {
            return res.status(400).json({ error: 'ID do curso inválido' });
        }

        const curso = await prisma.curso.findUnique({
            where: { 
                id: cursoId
            },
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
        console.error('❌ Erro ao buscar curso:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar curso',
            details: error.message 
        });
    }
});

// ✅ POST /api/cursos - CRIAR NOVO CURSO
app.post('/api/cursos', async (req, res) => {
    try {
        console.log('🎯 Criando novo curso...', req.body);
        
        const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo, modulos } = req.body;

        // Validar dados obrigatórios
        if (!titulo || !materia || !categoria || !nivel || !duracao) {
            return res.status(400).json({ 
                error: 'Dados incompletos',
                required: ['titulo', 'materia', 'categoria', 'nivel', 'duracao']
            });
        }

        // Criar curso com módulos e aulas em uma transação
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
            if (modulos && modulos.length > 0) {
                for (const moduloData of modulos) {
                    const modulo = await tx.modulo.create({
                        data: {
                            titulo: moduloData.titulo.trim(),
                            descricao: moduloData.descricao?.trim() || '',
                            ordem: moduloData.ordem || 1,
                            cursoId: curso.id
                        }
                    });

                    // Criar aulas do módulo
                    if (moduloData.aulas && moduloData.aulas.length > 0) {
                        for (const aulaData of moduloData.aulas) {
                            await tx.aula.create({
                                data: {
                                    titulo: aulaData.titulo.trim(),
                                    descricao: aulaData.descricao?.trim() || '',
                                    conteudo: aulaData.conteudo?.trim() || '',
                                    videoUrl: aulaData.videoUrl?.trim() || null,
                                    duracao: parseInt(aulaData.duracao) || 15,
                                    ordem: aulaData.ordem || 1,
                                    moduloId: modulo.id
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
                        include: {
                            aulas: true
                        }
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
        console.error('❌ Erro ao criar curso:', error);
        res.status(500).json({ 
            error: 'Erro ao criar curso',
            details: error.message 
        });
    }
});

// ✅ PUT /api/cursos/:id - ATUALIZAR CURSO
app.put('/api/cursos/:id', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo } = req.body;

        console.log(`✏️ Atualizando curso ID: ${cursoId}`, req.body);

        if (isNaN(cursoId)) {
            return res.status(400).json({ error: 'ID do curso inválido' });
        }

        // Verificar se o curso existe
        const cursoExistente = await prisma.curso.findUnique({
            where: { id: cursoId }
        });

        if (!cursoExistente) {
            return res.status(404).json({ error: 'Curso não encontrado' });
        }

        // Atualizar curso
        const cursoAtualizado = await prisma.curso.update({
            where: { id: cursoId },
            data: {
                ...(titulo && { titulo: titulo.trim() }),
                ...(descricao !== undefined && { descricao: descricao.trim() }),
                ...(materia && { materia: materia.trim() }),
                ...(categoria && { categoria: categoria.trim() }),
                ...(nivel && { nivel: nivel.trim() }),
                ...(duracao && { duracao: parseInt(duracao) }),
                ...(imagem !== undefined && { imagem: imagem?.trim() || null }),
                ...(ativo !== undefined && { ativo: ativo }),
                atualizadoEm: new Date()
            },
            include: {
                modulos: {
                    include: {
                        aulas: true
                    }
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
        console.error('❌ Erro ao atualizar curso:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar curso',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/cursos/:id - EXCLUIR CURSO
app.delete('/api/cursos/:id', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        console.log(`🗑️ Excluindo curso ID: ${cursoId}`);

        if (isNaN(cursoId)) {
            return res.status(400).json({ error: 'ID do curso inválido' });
        }

        // Verificar se o curso existe
        const cursoExistente = await prisma.curso.findUnique({
            where: { id: cursoId }
        });

        if (!cursoExistente) {
            return res.status(404).json({ error: 'Curso não encontrado' });
        }

        // Excluir curso (o cascade do Prisma vai excluir módulos e aulas automaticamente)
        await prisma.curso.delete({
            where: { id: cursoId }
        });

        console.log(`✅ Curso excluído: ${cursoExistente.titulo}`);
        res.json({
            success: true,
            message: 'Curso excluído com sucesso!',
            cursoExcluido: {
                id: cursoExistente.id,
                titulo: cursoExistente.titulo
            }
        });

    } catch (error) {
        console.error('❌ Erro ao excluir curso:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir curso',
            details: error.message 
        });
    }
});

// ✅ GET /api/cursos/:id/modulos - MÓDULOS DO CURSO (CORREÇÃO CRÍTICA)
app.get('/api/cursos/:id/modulos', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        const usuarioId = req.query.usuarioId ? parseInt(req.query.usuarioId) : null;
        
        console.log(`📂 Buscando módulos do curso ${cursoId}, usuário: ${usuarioId}`);

        if (isNaN(cursoId)) {
            return res.status(400).json({ error: 'ID do curso inválido' });
        }

        // Verificar se o curso existe
        const cursoExiste = await prisma.curso.findUnique({
            where: { id: cursoId }
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
        
        // Retornar array vazio se não há módulos
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
app.get('/api/cursos/:cursoId/modulos', async (req, res) => {
    // Redirecionar para a rota padrão
    const cursoId = req.params.cursoId;
    const queryParams = new URLSearchParams(req.query).toString();
    const redirectUrl = `/api/cursos/${cursoId}/modulos${queryParams ? '?' + queryParams : ''}`;
    
    console.log(`🔄 Redirecionando: ${req.originalUrl} -> ${redirectUrl}`);
    res.redirect(307, redirectUrl);
});

// ✅ GET /api/aulas/:id - DETALHES DA AULA
app.get('/api/aulas/:id', async (req, res) => {
    try {
        const aulaId = parseInt(req.params.id);
        const usuarioId = req.query.usuarioId ? parseInt(req.query.usuarioId) : null;
        
        console.log(`🎓 Buscando aula ${aulaId}, usuário: ${usuarioId}`);

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
            return res.status(404).json({ error: 'Aula não encontrada' });
        }

        res.json(aula);

    } catch (error) {
        console.error('❌ Erro ao buscar aula:', error);
        res.status(500).json({ error: 'Erro ao carregar aula' });
    }
});

// ✅ POST /api/progresso/aula - MARCAR AULA COMO CONCLUÍDA
app.post('/api/progresso/aula', async (req, res) => {
    try {
        const { usuarioId, aulaId, cursoId } = req.body;
        console.log(`📊 Registrando progresso - Usuário: ${usuarioId}, Aula: ${aulaId}, Curso: ${cursoId}`);

        if (!usuarioId || !aulaId || !cursoId) {
            return res.status(400).json({ error: 'Dados incompletos' });
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

// ========== ROTAS EXISTENTES ========== //

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

// ✅ PUT /api/usuarios/:id - ATUALIZAR USUÁRIO
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nome, ra, serie, pontuacao, desafiosCompletados } = req.body;

        console.log(`✏️ Atualizando usuário ID: ${userId}`, req.body);

        if (isNaN(userId)) {
            return res.status(400).json({ error: 'ID do usuário inválido' });
        }

        const usuarioAtualizado = await prisma.usuario.update({
            where: { id: userId },
            data: {
                ...(nome && { nome: nome.trim() }),
                ...(ra && { ra: ra.toString().trim() }),
                ...(serie && { serie: serie.trim() }),
                ...(pontuacao !== undefined && { pontuacao: parseInt(pontuacao) }),
                ...(desafiosCompletados !== undefined && { desafiosCompletados: parseInt(desafiosCompletados) }),
                atualizadoEm: new Date()
            }
        });

        console.log(`✅ Usuário atualizado: ${usuarioAtualizado.nome}`);
        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso!',
            usuario: usuarioAtualizado
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar usuário:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar usuário',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/usuarios/:id - EXCLUIR USUÁRIO
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        console.log(`🗑️ Excluindo usuário ID: ${userId}`);

        if (isNaN(userId)) {
            return res.status(400).json({ error: 'ID do usuário inválido' });
        }

        // Verificar se o usuário existe
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
        console.error('❌ Erro ao excluir usuário:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir usuário',
            details: error.message 
        });
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

// ✅ PUT /api/videos/:id - ATUALIZAR VÍDEO
app.put('/api/videos/:id', async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const { titulo, materia, categoria, url, descricao, duracao } = req.body;

        console.log(`✏️ Atualizando vídeo ID: ${videoId}`, req.body);

        if (isNaN(videoId)) {
            return res.status(400).json({ error: 'ID do vídeo inválido' });
        }

        const videoAtualizado = await prisma.video.update({
            where: { id: videoId },
            data: {
                ...(titulo && { titulo: titulo.trim() }),
                ...(materia && { materia: materia.trim() }),
                ...(categoria && { categoria: categoria.trim() }),
                ...(url && { url: url.trim() }),
                ...(descricao !== undefined && { descricao: descricao.trim() }),
                ...(duracao && { duracao: parseInt(duracao) })
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
            error: 'Erro ao atualizar vídeo',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/videos/:id - EXCLUIR VÍDEO
app.delete('/api/videos/:id', async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        console.log(`🗑️ Excluindo vídeo ID: ${videoId}`);

        if (isNaN(videoId)) {
            return res.status(400).json({ error: 'ID do vídeo inválido' });
        }

        // Verificar se o vídeo existe
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
        console.error('❌ Erro ao excluir vídeo:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir vídeo',
            details: error.message 
        });
    }
});

// ========== ROTA DE DEBUG ========== //

// ✅ ROTA PARA VERIFICAR CURSO 12 ESPECIFICAMENTE
app.get('/api/debug/curso-12', async (req, res) => {
    try {
        console.log('🔍 Debug: Verificando curso ID 12...');
        
        const curso = await prisma.curso.findUnique({
            where: { id: 12 },
            include: {
                modulos: {
                    include: {
                        aulas: true
                    }
                }
            }
        });

        if (!curso) {
            return res.json({ 
                exists: false,
                message: 'Curso 12 não existe no banco de dados'
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
        res.status(500).json({ error: error.message });
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
            console.log(`\n🎯 ENDPOINTS PRINCIPAIS:`);
            console.log(`✅  GET /api/cursos`);
            console.log(`✅  POST /api/cursos`);
            console.log(`✅  PUT /api/cursos/:id`);
            console.log(`✅  DELETE /api/cursos/:id`);
            console.log(`✅  GET /api/cursos/:id/modulos`);
            console.log(`✅  GET /api/health`);
            console.log(`🔍  GET /api/debug/curso-12`);
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
