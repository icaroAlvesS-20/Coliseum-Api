import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Configuração de paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// ✅ SERVIR TODOS OS ARQUIVOS ESTÁTICOS DA PASTA COLISEUM
app.use(express.static(path.join(__dirname)));

// ✅ ROTAS PRINCIPAIS DO SEU FRONTEND
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Coliseum', 'Login', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'Coliseum', 'Login', 'index.html'));
});

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'Coliseum', 'Menu', 'indexM.html'));
});

// ✅ ROTAS PARA OUTRAS PÁGINAS (se tiver)
app.get('/ranking', (req, res) => {
  const rankingPath = path.join(__dirname, 'Coliseum', 'Ranking', 'index.html');
  if (fs.existsSync(rankingPath)) {
    res.sendFile(rankingPath);
  } else {
    res.sendFile(path.join(__dirname, 'Coliseum', 'Menu', 'indexM.html'));
  }
});

app.get('/perfil', (req, res) => {
  const perfilPath = path.join(__dirname, 'Coliseum', 'Perfil', 'index.html');
  if (fs.existsSync(perfilPath)) {
    res.sendFile(perfilPath);
  } else {
    res.sendFile(path.join(__dirname, 'Coliseum', 'Menu', 'indexM.html'));
  }
});

app.get('/desafios', (req, res) => {
  const desafiosPath = path.join(__dirname, 'Coliseum', 'Desafios', 'index.html');
  if (fs.existsSync(desafiosPath)) {
    res.sendFile(desafiosPath);
  } else {
    res.sendFile(path.join(__dirname, 'Coliseum', 'Menu', 'indexM.html'));
  }
});

// ========== ROTAS API (BACKEND) ========== //
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'API Coliseum funcionando!',
    frontend: 'HTML/CSS/JS',
    structure: 'Coliseum/Login/index.html',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/ranking', async (req, res) => {
  try {
    const prisma = new PrismaClient();
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

// ✅ ROTA DE FALLBACK - para SPA
app.get('*', (req, res) => {
  // Tenta servir a página específica, se não encontrar vai para o menu
  const requestedPath = req.path;
  
  if (requestedPath === '/' || requestedPath === '/login') {
    return res.sendFile(path.join(__dirname, 'Coliseum', 'Login', 'index.html'));
  }
  
  // Tenta encontrar a página na estrutura Coliseum/*
  const possiblePath = path.join(__dirname, 'Coliseum', requestedPath.substring(1), 'index.html');
  if (fs.existsSync(possiblePath)) {
    return res.sendFile(possiblePath);
  }
  
  // Fallback para o menu
  res.sendFile(path.join(__dirname, 'Coliseum', 'Menu', 'indexM.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando: http://localhost:${PORT}`);
  console.log(`📁 Frontend: Coliseum/Login/index.html`);
  console.log(`🎮 Menu: Coliseum/Menu/indexM.html`);
  console.log(`🔧 Backend API: /api/health, /api/ranking, /api/usuarios`);
});

export default app;
