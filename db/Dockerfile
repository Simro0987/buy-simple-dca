# Own Postgres for buy-simple-dca (Flux component "db").
# postgres:16-alpine + nightly encrypted (age, public key only) backups to Storj / any S3.
FROM postgres:16-alpine

RUN apk add --no-cache age curl tini \
 && addgroup -g 1000 dbsecret && addgroup postgres dbsecret \
 && age --version && curl --version | head -1

COPY db-entrypoint.sh backup-loop.sh backup.sh restore.sh s3.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/db-entrypoint.sh /usr/local/bin/backup-loop.sh /usr/local/bin/backup.sh \
      /usr/local/bin/restore.sh /usr/local/bin/s3.sh

ENV PGDATA=/var/lib/postgresql/data/pgdata \
    DB_SECRETS_DIR=/run/secrets/db \
    BACKUP_ENV_FILE=/var/lib/postgresql/data/backup.env \
    BACKUP_HOUR_UTC=2 \
    BACKUP_KEEP_DAYS=30 \
    BACKUP_KEEP_MIN=7 \
    S3_ENDPOINT=https://gateway.storjshare.io \
    S3_REGION=us-east-1 \
    S3_PREFIX=buy-simple-dca/

EXPOSE 5432
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD pg_isready -h 127.0.0.1 -U postgres -q || exit 1

ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/db-entrypoint.sh"]
CMD ["postgres"]
