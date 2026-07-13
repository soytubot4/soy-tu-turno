import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@soytuturno/db';
import { getTenantContext } from './tenant-context';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * PrismaService con `tenantSafe(callback)`: abre una transacción, setea
 * `app.tenant_id` con el contexto del request y corre el callback. Las queries
 * de adentro respetan las RLS policies (aislamiento por tenant).
 *
 *   await this.prisma.tenantSafe((tx) => tx.appointment.findMany())
 *
 * El rol DB del runtime NO debe tener BYPASSRLS.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async tenantSafe<T>(fn: (tx: Tx) => Promise<T>, tenantIdOverride?: string): Promise<T> {
    const tenantId = tenantIdOverride ?? getTenantContext()?.tenantId;
    if (!tenantId) {
      throw new Error('tenantSafe llamado sin tenant context. ¿Falta el guard o el endpoint es público?');
    }
    return this.$transaction(async (tx) => {
      // scope = transaction (se limpia al commit/rollback)
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, TRUE)`, tenantId);
      return fn(tx as unknown as Tx);
    });
  }

  /** Resuelve tenant por slug — corre SIN tenant context (al login/bootstrap del request). */
  async resolveTenantBySlug(slug: string): Promise<{ id: string; slug: string } | null> {
    const rows = await this.$queryRaw<Array<{ id: string; slug: string }>>(
      Prisma.sql`SELECT id, slug FROM tenants WHERE slug = ${slug} AND active = true LIMIT 1`,
    );
    return rows[0] ?? null;
  }
}
