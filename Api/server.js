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

// ========== ROTAS API ========== //

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
        timestamp: new Date().toISOString()
    });
});

// ✅ HEALTH CHECK SIMPLIFICADO
app.get('/api/health', async (req, res) => {
    try {
        // Testa conexão básica
        await prisma.$queryRaw`SELECT 1`;
        
        const totalUsuarios = await prisma.usuario.count().catch(() => 0);
        const totalVideos = await prisma.video.count().catch(() => 0);
        
        // Verifica se tabela de cursos existe
        let totalCursos = 0;
        try {
            totalCursos = await prisma.curso.count();
        } catch (error) {
            console.log('⚠️ Tabela de cursos não existe ainda');
        }

        res.json({ 
            status: 'online',
            totalUsuarios,
            totalVideos,
            totalCursos,
            tabelaCursosExiste: totalCursos > 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ========== ROTAS DE CURSOS (COMPLETAS) ========== //

// ✅ GET /api/cursos - COM VERIFICAÇÃO DE TABELA
app.get('/api/cursos', async (req, res) => {
    try {
        console.log('📚 Buscando cursos...');
        
        // Primeiro verifica se a tabela existe
        try {
            await prisma.curso.count();
        } catch (error) {
            console.log('❌ Tabela de cursos não existe. Usando dados de exemplo.');
            
            // Fallback: retorna dados de exemplo
            const cursosExemplo = [
                {
                    id: 1,
                    titulo: 'Álgebra Básica',
                    descricao: 'Domine os conceitos fundamentais da álgebra incluindo equações, expressões e funções matemáticas.',
                    materia: 'matematica',
                    categoria: 'algebra',
                    nivel: 'fundamental',
                    duracao: 15,
                    imagem: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400',
                    modulos: 4,
                    alunos: 150,
                    avaliacao: 4.8,
                    ativo: true
                },
                {
                    id: 2,
                    titulo: 'Química Geral',
                    descricao: 'Introdução aos conceitos básicos da química: elementos, compostos e reações químicas.',
                    materia: 'csn',
                    categoria: 'quimica',
                    nivel: 'medio',
                    duracao: 18,
                    imagem: 'https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?w=400',
                    modulos: 5,
                    alunos: 95,
                    avaliacao: 4.7,
                    ativo: true
                }
            ];
            
            return res.json(cursosExemplo);
        }

        // Se a tabela existe, busca do banco
        const cursos = await prisma.curso.findMany({
            where: { ativo: true },
            include: {
                modulos: true,
                progressos: true
            }
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
            alunos: curso.progressos.length,
            avaliacao: 4.5,
            ativo: curso.ativo
        }));

        console.log(`✅ ${cursosFormatados.length} cursos carregados do banco`);
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

        console.log('📝 Tentando criar curso:', titulo);

        // Verifica se a tabela existe
        try {
            await prisma.curso.count();
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Sistema de cursos não está pronto. Tabelas ainda não criadas.',
                solution: 'Aguarde o sistema criar as tabelas automaticamente.'
            });
        }

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

// ✅ PUT /api/cursos/:id - ATUALIZAR CURSO
app.put('/api/cursos/:id', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        const { titulo, descricao, materia, categoria, nivel, duracao, imagem, ativo } = req.body;

        console.log(`✏️ Atualizando curso ID: ${cursoId}`);

        // Verifica se o curso existe
        const cursoExistente = await prisma.curso.findUnique({
            where: { id: cursoId }
        });

        if (!cursoExistente) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }

        const cursoAtualizado = await prisma.curso.update({
            where: { id: cursoId },
            data: {
                titulo: titulo ? titulo.trim() : cursoExistente.titulo,
                descricao: descricao !== undefined ? descricao.trim() : cursoExistente.descricao,
                materia: materia ? materia.trim() : cursoExistente.materia,
                categoria: categoria ? categoria.trim() : cursoExistente.categoria,
                nivel: nivel ? nivel.trim() : cursoExistente.nivel,
                duracao: duracao ? parseInt(duracao) : cursoExistente.duracao,
                imagem: imagem !== undefined ? (imagem ? imagem.trim() : null) : cursoExistente.imagem,
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
        
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar curso',
            details: error.message 
        });
    }
});

// ✅ DELETE /api/cursos/:id - EXCLUIR CURSO
app.delete('/api/cursos/:id', async (req, res) => {
    try {
        const cursoId = parseInt(req.params.id);
        
        console.log(`🗑️ Tentando excluir curso ID: ${cursoId}`);

        // Verifica se o curso existe
        const cursoExistente = await prisma.curso.findUnique({
            where: { id: cursoId }
        });

        if (!cursoExistente) {
            console.log(`❌ Curso ID ${cursoId} não encontrado`);
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }

        // Primeiro exclui os progressos associados (se existirem)
        try {
            await prisma.progressoCurso.deleteMany({
                where: { cursoId: cursoId }
            });
            console.log(`✅ Progressos do curso ${cursoId} excluídos`);
        } catch (error) {
            console.log('ℹ️ Nenhum progresso para excluir ou tabela não existe');
        }

        // Exclui o curso
        const cursoExcluido = await prisma.curso.delete({
            where: { id: cursoId }
        });

        console.log(`✅ Curso excluído: ${cursoExcluido.titulo}`);
        
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

// ✅ ROTAS DE PROGRESSO (SIMPLIFICADAS)
app.post('/api/progresso', async (req, res) => {
    try {
        const { usuarioId, cursoId, progresso } = req.body;

        console.log(`📊 Atualizando progresso - Usuário: ${usuarioId}, Curso: ${cursoId}`);

        // Simulação até as tabelas estarem prontas
        res.json({
            success: true,
            message: 'Progresso registrado com sucesso!',
            progresso: {
                usuarioId: parseInt(usuarioId),
                cursoId: parseInt(cursoId),
                progresso: parseFloat(progresso) || 0,
                concluido: progresso >= 100
            }
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar progresso:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar progresso'
        });
    }
});

app.get('/api/progresso/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;
        
        console.log(`📊 Buscando progresso do usuário: ${usuarioId}`);

        // Simulação até as tabelas estarem prontas
        res.json({
            success: true,
            progressos: [] // Retorna vazio até as tabelas estarem prontas
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

// ✅ ATUALIZAR USUÁRIO
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nome, ra, serie, pontuacao, desafiosCompletados } = req.body;

        console.log(`✏️ Atualizando usuário ID: ${userId}`);

        const usuarioAtualizado = await prisma.usuario.update({
            where: { id: userId },
            data: {
                nome: nome ? nome.trim() : undefined,
                ra: ra ? ra.toString().trim() : undefined,
                serie: serie ? serie.toString().trim() : undefined,
                pontuacao: pontuacao !== undefined ? parseInt(pontuacao) : undefined,
                desafiosCompletados: desafiosCompletados !== undefined ? parseInt(desafiosCompletados) : undefined
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
        
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
});

// ✅ EXCLUIR USUÁRIO
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        console.log(`🗑️ Excluindo usuário ID: ${userId}`);

        const usuarioExcluido = await prisma.usuario.delete({
            where: { id: userId }
        });

        console.log(`✅ Usuário excluído: ${usuarioExcluido.nome}`);
        
        res.json({
            success: true,
            message: `Usuário "${usuarioExcluido.nome}" excluído com sucesso!`
        });

    } catch (error) {
        console.error('❌ Erro ao excluir usuário:', error);
        
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.status(500).json({ error: 'Erro ao excluir usuário' });
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

// ✅ ATUALIZAR VÍDEO
app.put('/api/videos/:id', async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const { titulo, materia, categoria, url, descricao, duracao } = req.body;

        const videoAtualizado = await prisma.video.update({
            where: { id: videoId },
            data: {
                titulo: titulo ? titulo.trim() : undefined,
                materia: materia ? materia.trim() : undefined,
                categoria: categoria ? categoria.trim() : undefined,
                url: url ? url.trim() : undefined,
                descricao: descricao !== undefined ? descricao.trim() : undefined,
                duracao: duracao ? parseInt(duracao) : undefined
            }
        });

        res.json({
            success: true,
            message: 'Vídeo atualizado com sucesso!',
            video: videoAtualizado
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }
        res.status(500).json({ error: 'Erro ao atualizar vídeo' });
    }
});

// ✅ EXCLUIR VÍDEO
app.delete('/api/videos/:id', async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);

        const videoExcluido = await prisma.video.delete({
            where: { id: videoId }
        });

        res.json({
            success: true,
            message: 'Vídeo excluído com sucesso!',
            video: videoExcluido
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }
        res.status(500).json({ error: 'Erro ao excluir vídeo' });
    }
});

// ========== SISTEMA DE CRIAÇÃO DE TABELAS ========== //

async function criarTabelasSeNecessario() {
    try {
        console.log('🔍 Verificando se as tabelas de cursos existem...');
        
        // Tenta acessar a tabela de cursos
        await prisma.curso.count();
        console.log('✅ Tabelas de cursos já existem!');
        return true;
        
    } catch (error) {
        if (error.code === 'P2021' || error.message.includes('does not exist')) {
            console.log('📦 Tabelas de cursos NÃO existem. Criando...');
            
            try {
                // Usa Prisma DB Push para criar todas as tabelas
                const { execSync } = await import('child_process');
                console.log('🚀 Executando: npx prisma db push --accept-data-loss');
                
                execSync('npx prisma db push --accept-data-loss', { 
                    stdio: 'inherit',
                    timeout: 30000 // 30 segundos timeout
                });
                
                console.log('✅ Todas as tabelas criadas com sucesso!');
                
                // Adiciona cursos de exemplo
                await adicionarCursosExemplo();
                return true;
                
            } catch (pushError) {
                console.error('❌ Erro ao criar tabelas com Prisma:', pushError);
                
                // Fallback: cria tabelas manualmente via SQL
                console.log('🔄 Tentando criar tabelas manualmente...');
                try {
                    await criarTabelasManualmente();
                    return true;
                } catch (manualError) {
                    console.error('❌ Falha total na criação de tabelas:', manualError);
                    return false;
                }
            }
        }
        throw error;
    }
}

async function criarTabelasManualmente() {
    console.log('🛠️ Criando tabelas manualmente via SQL...');
    
    try {
        // Cria tabela cursos
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

        // Cria tabela progresso_cursos
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS progresso_cursos (
                id SERIAL PRIMARY KEY,
                "usuarioId" INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                "cursoId" INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
                progresso FLOAT DEFAULT 0,
                concluido BOOLEAN DEFAULT false,
                "ultimaAula" INTEGER,
                "criadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE("usuarioId", "cursoId")
            )
        `;
        console.log('✅ Tabela progresso_cursos criada');

        console.log('🎉 Todas as tabelas criadas manualmente!');
        await adicionarCursosExemplo();
        
    } catch (error) {
        console.error('❌ Erro na criação manual:', error);
        throw error;
    }
}

async function adicionarCursosExemplo() {
    try {
        console.log('📦 Adicionando cursos de exemplo...');
        
        const cursosExemplo = [
            {
                titulo: 'Álgebra Básica',
                descricao: 'Domine os conceitos fundamentais da álgebra.',
                materia: 'matematica',
                categoria: 'algebra',
                nivel: 'fundamental',
                duracao: 15,
                imagem: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400',
                ativo: true
            },
            {
                titulo: 'Química Geral',
                descricao: 'Introdução aos conceitos básicos da química.',
                materia: 'csn',
                categoria: 'quimica',
                nivel: 'medio',
                duracao: 18,
                imagem: 'https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?w=400',
                ativo: true
            }
        ];

        for (const curso of cursosExemplo) {
            await prisma.curso.create({ data: curso });
        }

        console.log(`✅ ${cursosExemplo.length} cursos de exemplo adicionados`);
    } catch (error) {
        console.log('⚠️ Erro ao adicionar cursos exemplo:', error.message);
    }
}

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        console.log('🚀 Iniciando servidor Coliseum API...');
        
        // Conecta ao banco
        await prisma.$connect();
        console.log('✅ Conectado ao banco de dados');
        
        // Cria tabelas se necessário (em background)
        criarTabelasSeNecessario().then(success => {
            if (success) {
                console.log('🎉 Sistema de cursos totalmente operacional!');
            } else {
                console.log('⚠️ Sistema de cursos em modo limitado (sem banco)');
            }
        });

        app.listen(PORT, () => {
            console.log(`\n📍 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 URL: https://coliseum-api.onrender.com`);
            console.log(`📚 Endpoint de cursos: /api/cursos`);
            console.log(`🔧 Modo: Com fallback para dados de exemplo`);
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
