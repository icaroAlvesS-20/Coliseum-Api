import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupDatabase() {
    console.log('🔧 Iniciando configuração do banco de dados...');

    try {
        // 1. Criar tabela Usuario
        console.log('📋 Criando tabela Usuario...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Usuario" (
                "id" SERIAL PRIMARY KEY,
                "ra" VARCHAR(255) UNIQUE NOT NULL,
                "nome" VARCHAR(255) NOT NULL,
                "senha" VARCHAR(255) NOT NULL,
                "serie" VARCHAR(255) NOT NULL,
                "curso" VARCHAR(255) DEFAULT 'matematica',
                "status" VARCHAR(255) DEFAULT 'ativo',
                "pontuacao" INTEGER DEFAULT 0,
                "desafiosCompletados" INTEGER DEFAULT 0,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('✅ Tabela Usuario criada');

        // 2. Criar tabela cursos
        console.log('📚 Criando tabela cursos...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "cursos" (
                "id" SERIAL PRIMARY KEY,
                "titulo" VARCHAR(255) NOT NULL,
                "descricao" TEXT,
                "materia" VARCHAR(255) NOT NULL,
                "categoria" VARCHAR(255) NOT NULL,
                "nivel" VARCHAR(255) NOT NULL,
                "duracao" INTEGER NOT NULL,
                "imagem" VARCHAR(500),
                "ativo" BOOLEAN DEFAULT true,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('✅ Tabela cursos criada');

        // 3. Criar tabela modulos
        console.log('📦 Criando tabela modulos...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "modulos" (
                "id" SERIAL PRIMARY KEY,
                "titulo" VARCHAR(255) NOT NULL,
                "descricao" TEXT,
                "ordem" INTEGER DEFAULT 1,
                "ativo" BOOLEAN DEFAULT true,
                "cursoId" INTEGER NOT NULL,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("cursoId") REFERENCES "cursos"("id") ON DELETE CASCADE
            );
        `;
        console.log('✅ Tabela modulos criada');

        // 4. Criar tabela aulas
        console.log('🎓 Criando tabela aulas...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "aulas" (
                "id" SERIAL PRIMARY KEY,
                "titulo" VARCHAR(255) NOT NULL,
                "descricao" TEXT,
                "conteudo" TEXT,
                "videoUrl" VARCHAR(500),
                "duracao" INTEGER DEFAULT 15,
                "ordem" INTEGER DEFAULT 1,
                "ativo" BOOLEAN DEFAULT true,
                "moduloId" INTEGER NOT NULL,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE
            );
        `;
        console.log('✅ Tabela aulas criada');

        // 5. Criar tabela videos
        console.log('📹 Criando tabela videos...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "videos" (
                "id" SERIAL PRIMARY KEY,
                "titulo" VARCHAR(255) NOT NULL,
                "materia" VARCHAR(255) NOT NULL,
                "categoria" VARCHAR(255) NOT NULL,
                "url" VARCHAR(500) NOT NULL,
                "descricao" TEXT,
                "duracao" INTEGER NOT NULL,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('✅ Tabela videos criada');

        // 6. Criar tabela desafios
        console.log('🎯 Criando tabela desafios...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "desafios" (
                "id" SERIAL PRIMARY KEY,
                "titulo" VARCHAR(255) NOT NULL,
                "descricao" TEXT,
                "materia" VARCHAR(255) NOT NULL,
                "nivel" VARCHAR(255) NOT NULL,
                "pontuacao" INTEGER DEFAULT 20,
                "duracao" INTEGER DEFAULT 15,
                "status" VARCHAR(255) DEFAULT 'ativo',
                "maxTentativas" INTEGER DEFAULT 1,
                "dataInicio" TIMESTAMP(3),
                "dataFim" TIMESTAMP(3),
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('✅ Tabela desafios criada');

        // 7. Criar tabela perguntas_desafio
        console.log('❓ Criando tabela perguntas_desafio...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "perguntas_desafio" (
                "id" SERIAL PRIMARY KEY,
                "pergunta" TEXT NOT NULL,
                "alternativaA" TEXT NOT NULL,
                "alternativaB" TEXT NOT NULL,
                "alternativaC" TEXT NOT NULL,
                "alternativaD" TEXT NOT NULL,
                "correta" INTEGER NOT NULL,
                "explicacao" TEXT,
                "ordem" INTEGER DEFAULT 1,
                "ativo" BOOLEAN DEFAULT true,
                "desafioId" INTEGER NOT NULL,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("desafioId") REFERENCES "desafios"("id") ON DELETE CASCADE
            );
        `;
        console.log('✅ Tabela perguntas_desafio criada');

        // 8. Criar tabela historico_desafios
        console.log('📊 Criando tabela historico_desafios...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "historico_desafios" (
                "id" SERIAL PRIMARY KEY,
                "pontuacaoGanha" INTEGER NOT NULL,
                "acertos" INTEGER NOT NULL,
                "totalPerguntas" INTEGER NOT NULL,
                "porcentagemAcerto" FLOAT NOT NULL,
                "dataConclusao" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                "usuarioId" INTEGER NOT NULL,
                "desafioId" INTEGER NOT NULL,
                "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE,
                FOREIGN KEY ("desafioId") REFERENCES "desafios"("id") ON DELETE CASCADE
            );
        `;
          console.log('✅ Tabela historico_desafios criada');
        
        console.log('💬 Criando tabela mensagens_chat...');
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "mensagens_chat" (
                "id" SERIAL PRIMARY KEY,
                "usuarioId" INTEGER NOT NULL,
                "conteudo" TEXT NOT NULL,
                "tipo" VARCHAR(255) DEFAULT 'texto',
                "timestamp" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE
            );
        `;
        console.log('✅ Tabela mensagens_chat criada');
        
        console.log('\n🎉 Configuração do banco de dados concluída com sucesso!');
        console.log('📊 Tabelas criadas:');
        console.log('  👥 Usuario');
        console.log('  📚 cursos');
        console.log('  📦 modulos');
        console.log('  🎓 aulas');
        console.log('  📹 videos');
        console.log('  🎯 desafios');
        console.log('  ❓ perguntas_desafio');
        console.log('  📊 historico_desafios');

    } catch (error) {
        console.error('❌ Erro ao configurar banco de dados:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar a configuração
setupDatabase();
