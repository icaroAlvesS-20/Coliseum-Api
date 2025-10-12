import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Configuração de paths para Render
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📁 Diretório atual:', __dirname);
console.log('🔍 Listando arquivos:', fs.readdirSync(__dirname));

app.use(cors());
app.use(express.json());

// ✅ SERVIR ARQUIVOS ESTÁTICOS DA RAIZ
app.use(express.static(__dirname));

// ✅ ROTA PRINCIPAL - LOGIN
app.get('/', (req, res) => {
  const loginPaths = [
    path.join(__dirname, 'Coliseum', 'Login', 'index.html'),
    path.join(__dirname, 'Login', 'index.html'),
    path.join(__dirname, 'index.html')
  ];
  
  for (const filePath of loginPaths) {
    if (fs.existsSync(filePath)) {
      console.log('✅ Servindo login:', filePath);
      return res.sendFile(filePath);
    }
  }
  
  console.log('❌ Login não encontrado. Paths tentados:', loginPaths);
  res.status(404).json({ error: 'Página de login não encontrada' });
});

// ✅ ROTA MENU
app.get('/menu', (req, res) => {
  const menuPaths = [
    path.join(__dirname, 'Coliseum', 'Menu', 'indexM.html'),
    path.join(__dirname, 'Menu', 'indexM.html')
  ];
  
  for (const filePath of menuPaths) {
    if (fs.existsSync(filePath)) {
      console.log('✅ Servindo menu:', filePath);
      return res.sendFile(filePath);
    }
  }
  
  res.status(404).json({ error: 'Página do menu não encontrada' });
});

// ✅ ROTA LOGIN
app.get('/login', (req, res) => {
  const loginPaths = [
    path.join(__dirname, 'Coliseum', 'Login', 'index.html'),
    path.join(__dirname, 'Login', 'index.html')
  ];
  
  for (const filePath of loginPaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.redirect('/');
});

// ========== ROTAS API (BACKEND) ========== //
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'API Coliseum funcionando no Render!',
    directory: __dirname,
    timestamp: new Date().toISOString()
  });
});

// ✅ MANTER SUAS ROTAS API EXISTENTES
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
    
    res.json(rankingComPosicoes);
    
  } catch (error) {
    console.error('❌ Erro ao buscar ranking:', error);
    res.status(500).json({ 
      error: 'Erro ao carregar ranking',
      details: error.message 
    });
  }
});

// ✅ MANTER SUAS OUTRAS ROTAS API...
app.post('/api/usuarios', async (req, res) => {
  // Seu código existente para login/cadastro
});

// ✅ ROTA DE FALLBACK MELHORADA
app.get('*', (req, res) => {
  const requestedPath = req.path;
  console.log('🔍 Rota solicitada:', requestedPath);
  
  // Se for API, retorna 404
  if (requestedPath.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint API não encontrado' });
  }
  
  // Tenta servir páginas HTML
  const htmlPaths = [
    path.join(__dirname, 'Coliseum', requestedPath.substring(1), 'index.html'),
    path.join(__dirname, 'Coliseum', requestedPath.substring(1), 'indexM.html'),
    path.join(__dirname, requestedPath.substring(1), 'index.html'),
    path.join(__dirname, requestedPath.substring(1) + '.html')
  ];
  
  for (const filePath of htmlPaths) {
    if (fs.existsSync(filePath)) {
      console.log('✅ Servindo página:', filePath);
      return res.sendFile(filePath);
    }
  }
  
  // Fallback para login
  console.log('🔄 Fallback para login');
  const loginPath = path.join(__dirname, 'Coliseum', 'Login', 'index.html');
  if (fs.existsSync(loginPath)) {
    return res.sendFile(loginPath);
  }
  
  res.status(404).json({ 
    error: 'Página não encontrada',
    path: requestedPath 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📁 Diretório: ${__dirname}`);
});

export default app;
