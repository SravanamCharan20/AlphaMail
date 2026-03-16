// 1) Watch registration (called after OAuth connect)
async function watchMailbox(account) {
  const gmail = makeGmailClient(account);
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.PUBSUB_TOPIC,
      labelIds: ["INBOX"],
    },
  });
  await EmailAccount.updateOne(
    { _id: account._id },
    {
      lastHistoryId: res.data.historyId,
    }
  );
}

// 2) Pub/Sub push handler
app.post("/gmail/push", verifyPubSubJwt, async (req, res) => {
  const payload = JSON.parse(
    Buffer.from(req.body.message.data, "base64").toString()
  );
  enqueueIncrementalSync({
    email: payload.emailAddress,
    historyId: payload.historyId,
  });
  res.status(204).send();
});

// 3) Incremental sync worker
async function incrementalSync({ email, historyId }) {
  const account = await EmailAccount.findOne({ email });
  if (!account?.lastHistoryId) {
    await fullSync(account.userId);
    await EmailAccount.updateOne(
      { _id: account._id },
      { lastHistoryId: historyId }
    );
    return;
  }

  let history;
  try {
    history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: account.lastHistoryId,
      historyTypes: ["messageAdded"],
    });
  } catch (e) {
    if (e.code === 404) {
      await fullSync(account.userId);
      await EmailAccount.updateOne(
        { _id: account._id },
        { lastHistoryId: historyId }
      );
      return;
    }
    throw e;
  }

  const ids = extractMessageIds(history.data.history);
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
    });
    await upsertEmail(msg.data, account);
  }

  await EmailAccount.updateOne(
    { _id: account._id },
    {
      lastHistoryId: history.data.historyId || historyId,
    }
  );
}
