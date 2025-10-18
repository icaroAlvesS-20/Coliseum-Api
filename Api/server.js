import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 10000;

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  errorFormat: 'minimal',
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=1&pool_timeout=30",
    },
  },
});

prisma.$use(async (params, next) => {
  try {
    return await next(params);
  } catch (error) {
    if (error.code === 'P1001' || error.message.includes('Closed')) {
      console.log('🔄 Reconectando ao banco Neon...');
      await prisma.$connect();
      return await next(params);
    }
    throw error;
  }
});
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.log('🔄 Reconectando periodicamente...');
    await prisma.$connect();
  }
}, 60000); // A cada 1 minuto

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://coliseum-ebon.vercel.app',
      'https://coliseum-m71foc1um-icaroass-projects.vercel.app',
      'https://coliseum-peon87g6t-icaroass-projects.vercel.app', // 🆕 NOVO DOMÍNIO
      /https:\/\/coliseum-.*\.vercel\.app$/, // ✅ Todos subdomínios coliseum-*
      /https:\/\/.*-icaroass-projects\.vercel\.app$/, // ✅ Todos seus projetos
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://127.0.0.1:3000',
      'https://coliseum-git-main-icaroass-projects.vercel.app'
    ];
    
    // Permite requests sem origin e todas as origins do Vercel
    if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Verifica se está na lista de permitidas
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
            reset_usuarios: '/api/reset (DELETE)'
        },
        frontend: 'Repositório separado no Vercel',
        timestamp: new Date().toISOString()
    });
});

// ✅ Health Check
// ✅ HEALTH CHECK MELHORADO - MANTÉM CONEXÃO ATIVA
app.get('/api/health', async (req, res) => {
  try {
    // Força uma query simples para manter conexão ativa
    await prisma.$queryRaw`SELECT 1`;
    const totalUsuarios = await prisma.usuario.count();
    const databaseInfo = await prisma.$queryRaw`SELECT version() as postgres_version, current_database() as database_name, now() as server_time`;
    
    res.json({ 
      status: 'online', 
      environment: 'production',
      platform: 'Render',
      database: 'Neon PostgreSQL',
      totalUsuarios: totalUsuarios,
      databaseInfo: databaseInfo[0],
      timestamp: new Date().toISOString(),
      server: 'Coliseum API v1.0'
    });
  } catch (error) {
    console.error('❌ Erro no health check:', error);
    // Tenta reconectar
    try {
      await prisma.$connect();
      console.log('✅ Reconectado ao banco');
    } catch (reconnectError) {
      console.error('❌ Falha na reconexão:', reconnectError);
    }
    res.status(500).json({ 
      error: 'Erro no banco de dados',
      details: error.message
    });
  }
});
// ✅ GET /api/ranking
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

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pontuacao, desafiosCompletados } = req.body;

    console.log(`🔄 Atualizando usuário ${id}:`, { pontuacao, desafiosCompletados });

    const result = await prisma.$transaction(async (tx) => {
      const usuarioAtualizado = await tx.usuario.update({
        where: { id: parseInt(id) },
        data: {
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
      return usuarioAtualizado;
    });

    console.log(`✅ Usuário ${id} atualizado e PERSISTIDO:`, result);

    res.json({
      success: true,
      message: 'Dados atualizados e salvos no banco!',
      usuario: result
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar usuário:', error);
    
    if (error.code === 'P1001' || error.message.includes('Closed')) {
      await prisma.$connect();
    }
    
    res.status(500).json({ 
      error: 'Erro ao atualizar dados do usuário',
      details: error.message 
    });
  }
});

app.get('/api/debug/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await prisma.usuario.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        nome: true,
        ra: true,
        serie: true,
        pontuacao: true,
        desafiosCompletados: true,
        atualizadoEm: true
      }
    });
    
    console.log(`🔍 DEBUG Usuário ${id}:`, usuario);
    
    res.json({
      usuario: usuario,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no debug:', error);
    res.status(500).json({ error: error.message });
  }
});

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

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ SOLICITAÇÃO: Excluir usuário ID: ${id}`);
        
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


app.delete('/api/usuarios', async (req, res) => {
    try {
        console.log('🗑️ SOLICITAÇÃO: Deletar TODOS os usuários');
        
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
            'DELETE /api/usuarios (RESET)',
            'POST /api/reset (RESET)'
        ]
    });
});

// ✅ ROTA DE FALLBACK GERAL
app.use('*', (req, res) => {
    res.json({
        message: '🚀 API Coliseum Backend',
        note: 'Frontend está em repositório separado',
        frontend_url: 'https://coliseum-ebon.vercel.app',
        api_endpoints: 'Acesse /api/health para status completo'
    });
});

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Conectado ao Neon PostgreSQL via Prisma');
        
        const totalUsuarios = await prisma.usuario.count();
        console.log(`👥 Total de usuários no banco: ${totalUsuarios}`);
        
        app.listen(PORT, () => {
            console.log('\n🚀🚀🚀 API COLISEUM NO RENDER! 🚀🚀🚀');
            console.log(`📍 Porta: ${PORT}`);
            console.log(`🌐 URL: https://coliseum-api.onrender.com`);
            console.log(`💾 Banco: Neon PostgreSQL`);
            console.log(`👥 Usuários: ${totalUsuarios}`);
            console.log(`\n📋 ENDPOINTS:`);
            console.log(`   ❤️  GET  /api/health`);
            console.log(`   🏆 GET  /api/ranking`);
            console.log(`   👤 POST /api/usuarios`);
            console.log(`   ✏️  PUT  /api/usuarios/:id`);
            console.log(`   🎯 POST /api/desafio-completo`);
            console.log(`   🗑️  DELETE /api/usuarios (RESET)`);
            console.log(`   🔄 POST /api/reset (RESET)`);
            console.log(`\n🎯 BACKEND PRONTO PARA RECEBER REQUISIÇÕES DO FRONTEND!`);
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






