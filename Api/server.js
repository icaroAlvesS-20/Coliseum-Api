import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Configuração do Prisma para Vercel
const isVercel = process.env.VERCEL === '1';

const prisma = new PrismaClient({
  log: isVercel ? ['error'] : ['warn', 'error'],
  errorFormat: 'minimal',
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// ✅ CORS OTIMIZADO PARA VERCEL
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      /https:\/\/coliseum-.*-icaroass-projects\.vercel\.app$/,
      /https:\/\/coliseum-.*-icaroase-projects\.vercel\.app$/,
      /https:\/\/coliseum-.*\.vercel\.app$/,
      'https://coliseum-ebon.vercel.app',
      'https://coliseum-git-main-icaroass-projects.vercel.app',
      'https://coliseum-icaroass-projects.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5500',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
    
    // Permite requisições sem origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Verifica se a origin está na lista de permitidas
    if (allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') return origin === pattern;
      return pattern.test(origin);
    })) {
      return callback(null, true);
    }
    
    console.log(`🚫 CORS bloqueado para: ${origin}`);
    return callback(new Error('CORS não permitido'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin']
}));

// ✅ MIDDLEWARE PARA REQUISIÇÕES OPTIONS (pré-flight)
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========== MIDDLEWARE DE LOG ========== //
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`, 
                req.method !== 'GET' ? req.body : '');
    next();
});

// ========== ROTAS API ========== //

// ✅ Health Check Melhorado
app.get('/api/health', async (req, res) => {
    try {
        const totalUsuarios = await prisma.usuario.count();
        const databaseInfo = await prisma.$queryRaw`SELECT version() as postgres_version, current_database() as database_name, now() as server_time`;
        
        res.json({ 
            status: 'online', 
            environment: isVercel ? 'production' : 'development',
            platform: 'Vercel',
            database: 'Neon PostgreSQL',
            totalUsuarios: totalUsuarios,
            databaseInfo: databaseInfo[0],
            timestamp: new Date().toISOString(),
            server: 'Coliseum API v1.0'
        });
    } catch (error) {
        console.error('❌ Erro no health check:', error);
        res.status(500).json({ 
            error: 'Erro no banco de dados',
            details: error.message,
            environment: isVercel ? 'production' : 'development'
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
            },
            take: 100 // Limite para performance
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

        // Validação básica
        if (ra.length < 3) {
            return res.status(400).json({ error: 'RA inválido' });
        }

        if (action === 'cadastro') {
            if (!nome || !senha || !serie) {
                return res.status(400).json({ 
                    error: 'Nome, senha e série são obrigatórios para cadastro' 
                });
            }

            // Validações adicionais
            if (nome.length < 2) {
                return res.status(400).json({ error: 'Nome muito curto' });
            }
            if (senha.length < 3) {
                return res.status(400).json({ error: 'Senha muito curta' });
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

                console.log(`✅ Novo usuário cadastrado: ${novoUsuario.nome} (RA: ${novoUsuario.ra})`);

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
            // LOGIN
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

            console.log(`✅ Login bem-sucedido: ${usuario.nome} (RA: ${usuario.ra})`);

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

// ✅ GET /api/usuarios/:id - Buscar usuário específico
app.get('/api/usuarios/:id', async (req, res) => {
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
                desafiosCompletados: true
            }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json(usuario);

    } catch (error) {
        console.error('❌ Erro ao buscar usuário:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar usuário',
            details: error.message 
        });
    }
});

// ✅ PUT /api/usuarios/:id - Atualizar pontuação
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

// ✅ POST /api/desafio-completo
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

        console.log(`🎯 Desafio completo registrado para usuário ${usuarioId} (+${pontuacaoGanha} pontos)`);

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

// ✅ GET /api/usuarios - Listar todos usuários (apenas desenvolvimento)
app.get('/api/usuarios', async (req, res) => {
    if (isVercel) {
        return res.status(403).json({ error: 'Endpoint disponível apenas em desenvolvimento' });
    }

    try {
        const usuarios = await prisma.usuario.findMany({
            select: {
                id: true,
                nome: true,
                ra: true,
                serie: true,
                pontuacao: true,
                desafiosCompletados: true
            },
            orderBy: { id: 'asc' }
        });

        res.json(usuarios);

    } catch (error) {
        console.error('❌ Erro ao listar usuários:', error);
        res.status(500).json({ 
            error: 'Erro ao listar usuários',
            details: error.message 
        });
    }
});

// ✅ ROTA DE FALLBACK PARA PÁGINAS NÃO ENCONTRADAS
app.use('*', (req, res) => {
    console.log(`❌ Rota não encontrada: ${req.method} ${req.originalUrl}`);
    
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ 
            error: 'Endpoint API não encontrado',
            path: req.originalUrl,
            method: req.method,
            availableEndpoints: [
                'GET  /api/health',
                'GET  /api/ranking', 
                'POST /api/usuarios',
                'GET  /api/usuarios/:id',
                'PUT  /api/usuarios/:id',
                'POST /api/desafio-completo'
            ]
        });
    }
    
    res.status(404).json({ 
        error: 'Rota não encontrada',
        path: req.originalUrl,
        method: req.method
    });
});

// ========== INICIALIZAÇÃO ========== //

async function startServer() {
    try {
        console.log('🔄 Conectando ao banco de dados...');
        await prisma.$connect();
        console.log('✅ Conectado ao Neon PostgreSQL via Prisma');
        
        const totalUsuarios = await prisma.usuario.count();
        console.log(`👥 Total de usuários no banco: ${totalUsuarios}`);
        
        app.listen(PORT, () => {
            console.log('\n🚀🚀🚀 API COLISEUM RODANDO NO VERCELL! 🚀🚀🚀');
            console.log(`📍 Porta: ${PORT}`);
            console.log(`🌐 Ambiente: ${isVercel ? 'PRODUCTION' : 'DEVELOPMENT'}`);
            console.log(`💾 Banco: Neon PostgreSQL`);
            console.log(`👥 Usuários: ${totalUsuarios}`);
            console.log(`\n📋 ENDPOINTS DISPONÍVEIS:`);
            console.log(`   ❤️  GET  /api/health`);
            console.log(`   🏆 GET  /api/ranking`);
            console.log(`   👤 POST /api/usuarios (login/cadastro)`);
            console.log(`   👤 GET  /api/usuarios/:id`);
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

process.on('SIGTERM', async () => {
    console.log('\n🛑 Desligando servidor (SIGTERM)...');
    await prisma.$disconnect();
    console.log('✅ Conexão com o banco fechada');
    process.exit(0);
});

// Inicializa o servidor
startServer();

export default app;
