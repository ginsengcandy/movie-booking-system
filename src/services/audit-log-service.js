export async function recordAuditLog(db, log) {
  const {
    eventType,
    actorUserId = null,
    targetType = null,
    targetId = null,
    action,
    status,
    message = null,
    metadata = {},
    ipAddress = null,
    userAgent = null
  } = log;

  await db.query(
    `INSERT INTO audit_logs (
       event_type,
       actor_user_id,
       target_type,
       target_id,
       action,
       status,
       message,
       metadata,
       ip_address,
       user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
    [
      eventType,
      actorUserId,
      targetType,
      targetId,
      action,
      status,
      message,
      JSON.stringify(metadata),
      ipAddress,
      userAgent
    ]
  );
}

export async function safeRecordAuditLog(db, log) {
  try {
    await recordAuditLog(db, log);
  } catch {
    // Audit logging must not mask the original API outcome.
  }
}
