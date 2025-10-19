import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CONFIGURAÇÃO CORRIGIDA PARA NEON - PERSISTÊNCIA GARANTIDA
const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
  // ✅ CONFIGURAÇÕES ESPECÍFICAS PARA NEON
  datasourceUrl: process.env.DATABASE_URL + "?connection_limit=5&pool_timeout=30&connect_timeout=30",
});

// ✅ MIDDLEWARE DE RECONEXÃO ROBUSTO
let connectionStatus = 'connected';

async function ensureConnection() {
  if (connectionStatus === 'connecting') return;
  
  try {
    connectionStatus = 'connecting';
    // Testa a conexão com query simples
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

// ✅ VERIFICA CONEXÃO ANTES DE CADA REQUEST IMPORTANTE
app.use(async (req, res, next) => {
  if (req.method !== 'GET' || req.path.includes('/api/health')) {
    await ensureConnection();
  }
  next();
});

// ✅ CORS COMPLETO PARA PERMITIR TODOS OS FRONTS
// ✅ CORS COMPLETO PARA PERMITIR TODOS OS FRONTS
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://coliseum-ebon.vercel.app',
      'https://coliseum-m71foc1um-icaroass-projects.vercel.app',
      'https://coliseum-peon87g6t-icaroass-projects.vercel.app',
      'https://coliseum-bigalfocm-icaroass-projects.vercel.app', // ✅ NOVA ORIGEM
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
// ✅ MIDDLEWARE PARA OPTIONS
app.options('*', cors());

app.use(express.json());

// ========== MIDDLEWARE DE LOG ========== //
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// ========== ROTAS API ========== //

// ✅ ROTA RAIZ DO BACKEND
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
            debug: '/api/debug/persistence/:id'
        },
        frontend: 'Repositório separado no Vercel',
        timestamp: new Date().toISOString()
    });
});

// ✅ HEALTH CHECK - COM VERIFICAÇÃO DE PERSISTÊNCIA
app.get('/api/health', async (req, res) => {
    try {
        await ensureConnection();
        const totalUsuarios = await prisma.usuario.count();
        const databaseInfo = await prisma.$queryRaw`SELECT version() as postgres_version, current_database() as database_name, now() as server_time`;
        
        res.json({ 
            status: 'online', 
            environment: 'production',
            platform: 'Render',
            database: 'Neon PostgreSQL',
            totalUsuarios: totalUsuarios,
            databaseInfo: databaseInfo[0],
            connectionStatus: connectionStatus,
            timestamp: new Date().toISOString(),
            server: 'Coliseum API v2.0 - PERSISTENCE FIX'
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


// ✅ PUT /api/usuarios/:id - Atualizar usuário COMPLETO COM PERSISTÊNCIA GARANTIDA
// ✅ PUT /api/usuarios/:id - Atualizar usuário COMPLETO COM PERSISTÊNCIA GARANTIDA
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, ra, serie, pontuacao, desafiosCompletados } = req.body;

        console.log(`🔄 [UPDATE COMPLETO] Usuário ${id}:`, { 
            nome, ra, serie, pontuacao, desafiosCompletados 
        });

        // ✅ GARANTE CONEXÃO ANTES DA ATUALIZAÇÃO
        await ensureConnection();

        // ATUALIZA O USUÁRIO COM TODOS OS CAMPOS
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

        // Verifica se o usuário existe
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

        // Exclui o usuário
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
            'GET  /api/debug/persistence/:id'
        ]
    });
});

// ✅ ROTA DE FALLBACK GERAL
app.use('*', (req, res) => {
    res.json({
        message: '🚀 API Coliseum Backend - PERSISTENCE FIX',
        note: 'Frontend está em repositório separado',
        frontend_url: 'https://coliseum-ebon.vercel.app',
        api_endpoints: 'Acesse /api/health para status completo',
        version: '2.0 - Neon Persistence Fix'
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

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        await ensureConnection();
        const totalUsuarios = await prisma.usuario.count();
        console.log('✅ Conectado ao Neon PostgreSQL via Prisma');
        console.log(`👥 Total de usuários no banco: ${totalUsuarios}`);
        
        app.listen(PORT, () => {
            console.log('\n🚀🚀🚀 API COLISEUM NO RENDER! 🚀🚀🚀');
            console.log(`📍 Porta: ${PORT}`);
            console.log(`🌐 URL: https://coliseum-api.onrender.com`);
            console.log(`💾 Banco: Neon PostgreSQL`);
            console.log(`👥 Usuários: ${totalUsuarios}`);
            console.log(`🔧 Versão: 2.0 - PERSISTENCE FIX`);
            console.log(`\n📋 ENDPOINTS:`);
            console.log(`   ❤️  GET  /api/health`);
            console.log(`   🏆 GET  /api/ranking`);
            console.log(`   👤 POST /api/usuarios`);
            console.log(`   ✏️  PUT  /api/usuarios/:id`);
            console.log(`   🎯 POST /api/desafio-completo`);
            console.log(`   🗑️  DELETE /api/usuarios/:id`);
            console.log(`   🗑️  DELETE /api/usuarios (RESET)`);
            console.log(`   🔄 POST /api/reset (RESET)`);
            console.log(`   🔍 GET  /api/debug/persistence/:id`);
            console.log(`\n🎯 BACKEND COM PERSISTÊNCIA GARANTIDA!`);
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

process.on('SIGTERM', async () => {
    console.log('\n🛑 Desligando servidor (SIGTERM)...');
    await prisma.$disconnect();
    console.log('✅ Conexão com o banco fechada');
    process.exit(0);
});

startServer();

export default app;




