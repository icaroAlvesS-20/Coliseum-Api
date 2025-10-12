import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 3001;

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal'
});

// ✅ CORS CORRIGIDO - TODOS OS DOMÍNIOS INCLUÍDOS
app.use(cors({
  origin: [
    'https://coliseum-el85mo0ge-icaroass-projects.vercel.app',
    'https://coliseum-ebon.vercel.app',
    'https://coliseum-git-main-iconcase-projects.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));

app.use(express.json());

// ========== MIDDLEWARE DE LOG ========== //
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// ========== ROTAS API COM BANCO REAL ========== //

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        const totalUsuarios = await prisma.usuario.count();
        const databaseInfo = await prisma.$queryRaw`SELECT version() as postgres_version, current_database() as database_name`;
        
        res.json({ 
            status: 'online', 
            database: 'Neon PostgreSQL',
            totalUsuarios: totalUsuarios,
            databaseInfo: databaseInfo[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro no health check:', error);
        res.status(500).json({ 
            error: 'Erro no banco de dados',
            details: error.message 
        });
    }
});

// GET /api/ranking
app.get('/api/ranking', async (req, res) => {
    try {
        console.log('📊 Buscando ranking do banco real...');
        
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

// POST /api/usuarios - Login/Cadastro
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
                const novoUsuario = await prisma.usuario.create({
                    data: {
                        ra: ra.trim(),
                        nome: nome.trim(),
                        senha: senha,
                        serie: serie.trim(),
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

            const usuario = await prisma.usuario.findFirst({
                where: {
                    ra: ra.trim(),
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

// PUT /api/usuarios/:id - Atualizar pontuação
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { pontuacao, desafiosCompletados } = req.body;

        console.log(`🔄 Atualizando usuário ${id}:`, { pontuacao, desafiosCompletados });

        const updateData = {};
        if (pontuacao !== undefined) updateData.pontuacao = parseInt(pontuacao);
        if (desafiosCompletados !== undefined) updateData.desafiosCompletados = parseInt(desafiosCompletados);

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'Nenhum dado para atualizar' });
        }

        const usuarioAtualizado = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: updateData,
            select: {
                id: true,
                nome: true,
                ra: true,
                serie: true,
                pontuacao: true,
                desafiosCompletados: true
            }
        });

        console.log(`✅ Usuário ${id} atualizado com sucesso`);

        res.json({
            success: true,
            message: 'Dados atualizados com sucesso!',
            usuario: usuarioAtualizado
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar usuário:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.status(500).json({ 
            error: 'Erro ao atualizar dados do usuário',
            details: error.message 
        });
    }
});

// POST /api/desafio-completo
app.post('/api/desafio-completo', async (req, res) => {
    try {
        const { usuarioId, pontuacaoGanha } = req.body;

        if (!usuarioId || !pontuacaoGanha) {
            return res.status(400).json({ error: 'usuarioId e pontuacaoGanha são obrigatórios' });
        }

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

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Conectado ao Neon PostgreSQL via Prisma');
        
        const totalUsuarios = await prisma.usuario.count();
        console.log(`👥 Total de usuários no banco: ${totalUsuarios}`);
        
        app.listen(PORT, () => {
            console.log('\n🚀🚀🚀 API COLISEUM COM BANCO REAL! 🚀🚀🚀');
            console.log(`📍 Porta: ${PORT}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`💾 Banco: Neon PostgreSQL`);
            console.log(`👥 Usuários: ${totalUsuarios}`);
            console.log(`\n📋 ENDPOINTS:`);
            console.log(`   ❤️  GET  /api/health`);
            console.log(`   🏆 GET  /api/ranking`);
            console.log(`   👤 POST /api/usuarios`);
            console.log(`   ✏️  PUT  /api/usuarios/:id`);
            console.log(`   🎯 POST /api/desafio-completo`);
            console.log(`\n🎯 PRONTO PARA RECEBER REQUISIÇÕES!`);
        });
        
    } catch (error) {
        console.error('❌ Falha ao conectar com o banco:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Desligando servidor...');
    await prisma.$disconnect();
    console.log('✅ Conexão com o banco fechada');
    process.exit(0);
});

startServer();
