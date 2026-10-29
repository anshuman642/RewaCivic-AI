const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
const app = require("./Server");

const { User, Report, LoginEvent } = app.locals.models;
const uploadDirectory = path.join(__dirname, "uploads");
const originalReadyState = mongoose.connection.readyState;
const originalJwtSecret = process.env.JWT_SECRET;
const originalAdminSetupKey = process.env.ADMIN_SETUP_KEY;
const originalMethods = {
  userCreate: User.create,
  userExists: User.exists,
  userFindById: User.findById,
  userFindOne: User.findOne,
  userFindByIdAndUpdate: User.findByIdAndUpdate,
  userDeleteOne: User.deleteOne,
  userInit: User.init,
  userFind: User.find,
  userCountDocuments: User.countDocuments,
  reportCreate: Report.create,
  reportFindById: Report.findById,
  reportFind: Report.find,
  reportFindByIdAndUpdate: Report.findByIdAndUpdate,
  reportFindOneAndUpdate: Report.findOneAndUpdate,
  reportFindOne: Report.findOne,
  reportUpdateMany: Report.updateMany,
  loginEventCreate: LoginEvent.create,
  loginEventDeleteMany: LoginEvent.deleteMany,
  loginEventFind: LoginEvent.find,
  loginEventCountDocuments: LoginEvent.countDocuments,
};
const users = [];
const reports = [];
const loginEvents = [];
let initialUploadedFiles;
let server;
let baseUrl;
let citizenCookie;
let secondCitizenCookie;
let adminCookie;
let workerCookie;
let workerAccount;
const workerPassword = "worker-personal-password";

function findUserById(id) {
  return users.find((user) => user.id === String(id)) ?? null;
}

function addEvidenceArrayHelpers(report) {
  report.resolutionEvidence ||= [];
  report.resolutionEvidence.id = (id) =>
    report.resolutionEvidence.find((entry) => String(entry._id) === String(id)) ?? null;
  const push = report.resolutionEvidence.push.bind(report.resolutionEvidence);
  report.resolutionEvidence.push = (...entries) =>
    push(...entries.map((entry) => ({
      ...entry,
      _id: entry._id || new mongoose.Types.ObjectId(),
    })));
  report.populate ||= async () => report;
  report.save ||= async function save() {
    return this;
  };
  return report;
}

async function postJson(url, body, cookie) {
  return fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

before(async () => {
  initialUploadedFiles = new Set(await fs.readdir(uploadDirectory));
  process.env.JWT_SECRET = "test-jwt-secret-long-enough-for-unit-tests-2026";
  process.env.ADMIN_SETUP_KEY = "test-admin-setup-secret-long-enough-2026";
  mongoose.connection.readyState = 1;

  User.init = async () => User;
  User.create = async (data) => {
    if (users.some((user) => user.email === data.email)) {
      const error = new Error("Duplicate email");
      error.code = 11000;
      throw error;
    }

    const userId = new mongoose.Types.ObjectId().toString();
    const user = {
      ...data,
      id: userId,
      _id: userId,
      createdAt: new Date(),
      save: async function save() {
        return this;
      },
    };
    users.push(user);
    return user;
  };
  User.exists = async (query) =>
    users.some((user) => {
      if (typeof query.role === "string" && user.role !== query.role) return false;
      if (query.role?.$in && !query.role.$in.includes(user.role)) return false;
      if (query._id && String(user._id) !== String(query._id)) return false;
      return true;
    });
  User.findById = (id) => {
    const user = findUserById(id);
    return {
      select: async () => user,
      then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
    };
  };
  User.findOne = (query) => ({
    select: async () => users.find((user) => user.email === query.email) ?? null,
  });
  User.find = (query) => ({
    offset: 0,
    pageSize: Infinity,
    select() {
      return this;
    },
    sort() {
      return this;
    },
    skip(offset) {
      this.offset = offset;
      return this;
    },
    limit(pageSize) {
      this.pageSize = pageSize;
      return this;
    },
    async lean() {
      const selectedUsers = users
        .filter((user) => {
          if (typeof query.role === "string") return user.role === query.role;
          if (query.role?.$in) return query.role.$in.includes(user.role);
          return true;
        })
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(this.offset, this.offset + this.pageSize);
      return selectedUsers
        .map(({ id, displayName, email, phone, role, mustChangePassword }) => ({
          id,
          displayName,
          email,
          phone,
          role,
          mustChangePassword,
          createdAt: users.find((user) => user.id === id).createdAt,
        }));
    },
  });
  User.countDocuments = async (query) =>
    users.filter((user) => {
      if (typeof query.role === "string") return user.role === query.role;
      if (query.role?.$in) return query.role.$in.includes(user.role);
      return true;
    }).length;
  User.findByIdAndUpdate = async (id, update) => {
    const user = findUserById(id);
    if (user) Object.assign(user, update);
    return user ?? null;
  };
  User.deleteOne = async ({ _id }) => {
    const index = users.findIndex((user) => String(user._id) === String(_id));
    if (index === -1) return { deletedCount: 0 };
    users.splice(index, 1);
    return { deletedCount: 1 };
  };
  LoginEvent.create = async (data) => {
    const event = { ...data, loginAt: new Date() };
    loginEvents.push(event);
    return event;
  };
  LoginEvent.deleteMany = async ({ user }) => {
    const matchingEvents = loginEvents.filter((event) => String(event.user) === String(user));
    for (const event of matchingEvents) {
      loginEvents.splice(loginEvents.indexOf(event), 1);
    }
    return { deletedCount: matchingEvents.length };
  };
  LoginEvent.find = () => ({
    offset: 0,
    pageSize: 0,
    sort() {
      return this;
    },
    skip(offset) {
      this.offset = offset;
      return this;
    },
    limit(pageSize) {
      this.pageSize = pageSize;
      return this;
    },
    populate() {
      return this;
    },
    then(resolve, reject) {
      const history = loginEvents
        .slice()
        .reverse()
        .slice(this.offset, this.offset + this.pageSize)
        .map((event) => ({
          loginAt: event.loginAt,
          user: (() => {
            const user = findUserById(event.user);
            return user
              ? {
                id: user.id,
                displayName: user.displayName,
                email: user.email,
                role: user.role,
              }
              : null;
          })(),
        }));
      return Promise.resolve(history).then(resolve, reject);
    },
  });
  LoginEvent.countDocuments = async () => loginEvents.length;

  Report.create = async (data) => {
    const report = addEvidenceArrayHelpers({
      ...data,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
    });
    reports.unshift(report);
    return report;
  };
  Report.find = (query) => ({
    sort() {
      return this;
    },
    select() {
      return this;
    },
    populate() {
      return this;
    },
    lean: async () => reports.filter((report) =>
      (!query.latitude?.$exists || Number.isFinite(report.latitude)) &&
      (!query.longitude?.$exists || Number.isFinite(report.longitude)),
    ),
    then(resolve, reject) {
      return Promise.resolve(
        reports.filter(
        (report) =>
          (!query.reporter || String(report.reporter) === String(query.reporter)) &&
          (!query.assignedTo || String(report.assignedTo) === String(query.assignedTo)),
        ),
      ).then(resolve, reject);
    },
  });
  Report.findById = async (id) => {
    const report = reports.find((entry) => String(entry._id) === String(id));
    if (report) report.populate = async () => report;
    return report ?? null;
  };
  Report.findByIdAndUpdate = (id, update) => {
    const report = reports.find((entry) => String(entry._id) === String(id));
    if (report) {
      Object.assign(report, update.$set || update);
      if (update.$push?.activity) {
        report.activity ||= [];
        report.activity.push({ ...update.$push.activity, createdAt: new Date() });
      }
    }
    return {
      populate() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(report ?? null).then(resolve, reject);
      },
    };
  };
  Report.findOneAndUpdate = (query, update) => {
    const report = reports.find(
      (entry) =>
        String(entry._id) === String(query._id) &&
        (!query.assignedTo || String(entry.assignedTo) === String(query.assignedTo)) &&
        (!query.status || entry.status === query.status),
    );
    if (report) {
      Object.assign(report, update.$set || update);
      if (update.$push?.activity) {
        report.activity ||= [];
        report.activity.push({ ...update.$push.activity, createdAt: new Date() });
      }
    }
    return {
      populate() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(report ?? null).then(resolve, reject);
      },
    };
  };
  Report.findOne = (query) => {
    const report = reports.find(
        (report) =>
          (!query._id || String(report._id) === String(query._id)) &&
          (!query.imageUrl || report.imageUrl === query.imageUrl) &&
              (!query.$or || query.$or.some((condition) =>
                Object.entries(condition).some(([field, value]) => {
                  if (field === "imageUrl") return report.imageUrl === value;
                  if (field === "resolutionEvidence.beforeImageUrl") {
                    return report.resolutionEvidence?.some((entry) => entry.beforeImageUrl === value);
                  }
                  if (field === "resolutionEvidence.afterImageUrl") {
                    return report.resolutionEvidence?.some((entry) => entry.afterImageUrl === value);
                  }
                  return false;
                }),
              )) &&
              (!query.reporter || String(report.reporter) === String(query.reporter)) &&
          (!query.assignedTo || String(report.assignedTo) === String(query.assignedTo)),
      ) ?? null;
    return {
      select: async () => report,
      then: (resolve, reject) => Promise.resolve(report).then(resolve, reject),
    };
  };
  Report.updateMany = async ({ assignedTo }, update) => {
    const matchingReports = reports.filter(
      (report) => String(report.assignedTo) === String(assignedTo),
    );
    for (const report of matchingReports) {
      Object.assign(report, update.$set);
    }
    return { modifiedCount: matchingReports.length };
  };

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  const uploadedFiles = await fs.readdir(uploadDirectory);
  await Promise.all(
    uploadedFiles
      .filter((file) => !initialUploadedFiles.has(file))
      .map((file) => fs.unlink(path.join(uploadDirectory, file))),
  );
  Object.assign(User, {
    create: originalMethods.userCreate,
    exists: originalMethods.userExists,
    findById: originalMethods.userFindById,
    findByIdAndUpdate: originalMethods.userFindByIdAndUpdate,
    deleteOne: originalMethods.userDeleteOne,
    findOne: originalMethods.userFindOne,
    init: originalMethods.userInit,
    find: originalMethods.userFind,
    countDocuments: originalMethods.userCountDocuments,
  });
  Object.assign(Report, {
    create: originalMethods.reportCreate,
    find: originalMethods.reportFind,
    findById: originalMethods.reportFindById,
    findByIdAndUpdate: originalMethods.reportFindByIdAndUpdate,
    findOneAndUpdate: originalMethods.reportFindOneAndUpdate,
    findOne: originalMethods.reportFindOne,
    updateMany: originalMethods.reportUpdateMany,
  });
  Object.assign(LoginEvent, {
    create: originalMethods.loginEventCreate,
    deleteMany: originalMethods.loginEventDeleteMany,
    find: originalMethods.loginEventFind,
    countDocuments: originalMethods.loginEventCountDocuments,
  });
  mongoose.connection.readyState = originalReadyState;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalAdminSetupKey === undefined) delete process.env.ADMIN_SETUP_KEY;
  else process.env.ADMIN_SETUP_KEY = originalAdminSetupKey;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("health endpoint reports server and database state", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.server, "online");
  assert.equal(body.database, "connected");
});

test("malformed JSON and disallowed browser origins receive client errors", async () => {
  const malformedResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformedResponse.status, 400);
  assert.match((await malformedResponse.json()).message, /valid JSON/i);

  const originResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(originResponse.status, 403);
  assert.match((await originResponse.json()).message, /CORS/i);
});

test("registration does not create an account when authentication is misconfigured", async () => {
  const configuredSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  try {
    const response = await postJson("/api/auth/register", {
      displayName: "Unconfigured Citizen",
      email: "unconfigured@example.com",
      password: "valid-citizen-password",
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /JWT_SECRET/);
    assert.equal(users.some((user) => user.email === "unconfigured@example.com"), false);
  } finally {
    process.env.JWT_SECRET = configuredSecret;
  }
});

test("citizens must authenticate before accessing reports or uploading photos", async () => {
  const reportsResponse = await fetch(`${baseUrl}/api/reports`);
  const reportsBody = await reportsResponse.json();
  assert.equal(reportsResponse.status, 401);
  assert.match(reportsBody.message, /sign in/i);

  const form = new FormData();
  form.set("photo", new Blob(["not an image"], { type: "image/svg+xml" }), "photo.svg");
  const uploadResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    body: form,
  });
  assert.equal(uploadResponse.status, 401);
});

test("citizen signup validates input and cannot choose an administrator role", async () => {
  const invalidResponse = await postJson("/api/auth/register", {
    displayName: "Citizen",
    email: "citizen@example.com",
    password: "short",
  });
  assert.equal(invalidResponse.status, 400);

  const response = await postJson("/api/auth/register", {
    displayName: "  Rewa Citizen  ",
    email: "Citizen@Example.com",
    password: "rewa-citizen-password",
    phone: "9876543210",
    role: "admin",
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.user.role, "citizen");
  assert.equal(body.user.email, "citizen@example.com");
  assert.equal(body.user.displayName, "Rewa Citizen");
  assert.equal(body.user.passwordHash, undefined);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=Strict/i);
  assert.equal(users[0].passwordHash === "rewa-citizen-password", false);
  citizenCookie = response.headers.get("set-cookie").split(";")[0];
});

test("duplicate citizen accounts receive a conflict response", async () => {
  const response = await postJson("/api/auth/register", {
    displayName: "Another Citizen",
    email: "CITIZEN@example.com",
    password: "rewa-citizen-password",
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.message, /already exists/i);
});

test("first admin requires the setup key and can only be registered once", async () => {
  const setupStatus = await fetch(`${baseUrl}/api/auth/admin-setup/status`);
  assert.equal((await setupStatus.json()).available, true);

  const invalidResponse = await postJson("/api/auth/admin-setup", {
    displayName: "Rewa Admin",
    email: "admin@example.com",
    password: "rewa-admin-password",
    setupKey: "wrong",
  });
  assert.equal(invalidResponse.status, 403);

  const response = await postJson("/api/auth/admin-setup", {
    displayName: "Rewa Admin",
    email: "admin@example.com",
    password: "rewa-admin-password",
    setupKey: process.env.ADMIN_SETUP_KEY,
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.user.role, "admin");
  adminCookie = response.headers.get("set-cookie").split(";")[0];

  const adminLoginResponse = await postJson("/api/auth/login", {
    email: "ADMIN@example.com",
    password: "rewa-admin-password",
    role: "admin",
  });
  assert.equal(adminLoginResponse.status, 200);
  assert.equal(loginEvents.length, 1);
  assert.equal(String(loginEvents[0].user), String(users.find((user) => user.role === "admin")._id));

  const closedStatus = await fetch(`${baseUrl}/api/auth/admin-setup/status`);
  assert.equal((await closedStatus.json()).available, false);

  const repeatedResponse = await postJson("/api/auth/admin-setup", {
    displayName: "Second Admin",
    email: "admin2@example.com",
    password: "another-admin-password",
    setupKey: process.env.ADMIN_SETUP_KEY,
  });
  assert.equal(repeatedResponse.status, 409);
});

test("login uses the password hash and restores a secure session", async () => {
  const invalidResponse = await postJson("/api/auth/login", {
    email: "citizen@example.com",
    password: "incorrect-password",
    role: "citizen",
  });
  assert.equal(invalidResponse.status, 401);

  const response = await postJson("/api/auth/login", {
    email: "CITIZEN@example.com",
    password: "rewa-citizen-password",
    role: "citizen",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.role, "citizen");
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal(loginEvents.length, 2);
  assert.ok(loginEvents.some((event) => String(event.user) === String(users[0]._id)));

  const wrongRoleResponse = await postJson("/api/auth/login", {
    email: "citizen@example.com",
    password: "rewa-citizen-password",
    role: "admin",
  });
  assert.equal(wrongRoleResponse.status, 401);
  assert.equal(loginEvents.length, 2);

  const citizenHistoryResponse = await fetch(`${baseUrl}/api/admin/login-history`, {
    headers: { Cookie: citizenCookie },
  });
  assert.equal(citizenHistoryResponse.status, 403);
});

test("citizen photo uploads are validated and remain private to their reporter", async () => {
  const signupResponse = await postJson("/api/auth/register", {
    displayName: "Second Citizen",
    email: "second@example.com",
    password: "second-citizen-password",
  });
  assert.equal(signupResponse.status, 201);
  secondCitizenCookie = signupResponse.headers.get("set-cookie").split(";")[0];

  const previousFiles = new Set(await fs.readdir(uploadDirectory));
  const badForm = new FormData();
  badForm.set("title", "Road damage");
  badForm.set("type", "Pothole");
  badForm.set("location", "University Road");
  badForm.set("photo", new Blob(["not an image"], { type: "image/png" }), "photo.png");
  const invalidPhotoResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { Cookie: secondCitizenCookie },
    body: badForm,
  });
  assert.equal(invalidPhotoResponse.status, 400);
  assert.match((await invalidPhotoResponse.json()).message, /does not match/i);

  const validForm = new FormData();
  validForm.set("title", "Road damage");
  validForm.set("description", "A large pothole near the intersection.");
  validForm.set("type", "Pothole");
  validForm.set("location", "University Road");
  validForm.set("latitude", "24.52660");
  validForm.set("longitude", "81.31540");
  validForm.set(
    "photo",
    new Blob(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: "image/png" },
    ),
    "road.png",
  );

  try {
    const createResponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { Cookie: secondCitizenCookie },
      body: validForm,
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.match(created.report.imageUrl, /^\/uploads\/[\da-f-]{36}\.png$/i);
    assert.equal(created.report.activity[0].event, "submitted");
    assert.equal(created.report.description, "A large pothole near the intersection.");
    assert.equal(created.report.latitude, 24.5266);
    assert.equal(created.report.longitude, 81.3154);

    const filename = path.basename(created.report.imageUrl);
    const ownPhotoResponse = await fetch(`${baseUrl}${created.report.imageUrl}`, {
      headers: { Cookie: secondCitizenCookie },
    });
    assert.equal(ownPhotoResponse.status, 200);
    assert.equal(ownPhotoResponse.headers.get("content-type"), "image/png");

    const privatePhotoResponse = await fetch(`${baseUrl}${created.report.imageUrl}`, {
      headers: { Cookie: citizenCookie },
    });
    assert.equal(privatePhotoResponse.status, 404);
    await fs.unlink(path.join(uploadDirectory, filename));
  } finally {
    const currentFiles = await fs.readdir(uploadDirectory);
    await Promise.all(
      currentFiles
        .filter((file) => !previousFiles.has(file))
        .map((file) => fs.unlink(path.join(uploadDirectory, file))),
    );
  }
});

test("report creation rejects incomplete or out-of-range map coordinates", async () => {
  const form = new FormData();
  form.set("title", "Road pothole");
  form.set("type", "Pothole");
  form.set("location", "Civil Lines");
  form.set("latitude", "24.5");
  const response = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { Cookie: citizenCookie },
    body: form,
  });
  assert.equal(response.status, 400);

  form.set("longitude", "999");
  const outOfRangeResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { Cookie: citizenCookie },
    body: form,
  });
  assert.equal(outOfRangeResponse.status, 400);
});

test("citizens see only their own reports and cannot change report status", async () => {
  const form = new FormData();
  form.set("title", "Road pothole");
  form.set("type", "Pothole");
  form.set("location", "Civil Lines, Rewa");
  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { Cookie: citizenCookie },
    body: form,
  });
  assert.equal(createResponse.status, 201);

  const listResponse = await fetch(`${baseUrl}/api/reports`, {
    headers: { Cookie: citizenCookie },
  });
  const listBody = await listResponse.json();
  assert.equal(listBody.count, 1);
  assert.equal(String(listBody.reports[0].reporter), String(users[0]._id));

  const statusResponse = await fetch(
    `${baseUrl}/api/reports/${listBody.reports[0]._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: citizenCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Resolved" }),
    },
  );
  assert.equal(statusResponse.status, 403);
});

test("admins can review every report, update status, and view citizens", async () => {
  const listResponse = await fetch(`${baseUrl}/api/reports`, {
    headers: { Cookie: adminCookie },
  });
  const listBody = await listResponse.json();
  assert.equal(listBody.count, 2);

  const statusResponse = await fetch(
    `${baseUrl}/api/reports/${listBody.reports[0]._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "In Progress" }),
    },
  );
  assert.equal(statusResponse.status, 200);
  assert.ok(reports[0].activity.some(
    (event) => event.event === "status" && event.status === "In Progress",
  ));

  const resolveWithoutEvidenceResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Resolved" }),
    },
  );
  assert.equal(resolveWithoutEvidenceResponse.status, 409);

  const citizensResponse = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Cookie: adminCookie },
  });
  const citizensBody = await citizensResponse.json();
  assert.equal(citizensResponse.status, 200);
  assert.equal(citizensBody.users.length, 3);
  assert.equal(citizensBody.users[0].passwordHash, undefined);
  assert.ok(citizensBody.users[0].createdAt);

  const firstAccountsPageResponse = await fetch(
    `${baseUrl}/api/admin/users?page=1&limit=1`,
    { headers: { Cookie: adminCookie } },
  );
  const firstAccountsPage = await firstAccountsPageResponse.json();
  assert.equal(firstAccountsPageResponse.status, 200);
  assert.equal(firstAccountsPage.users.length, 1);
  assert.equal(firstAccountsPage.total, 3);
  assert.equal(firstAccountsPage.hasMore, true);

  const secondAccountsPageResponse = await fetch(
    `${baseUrl}/api/admin/users?page=2&limit=1`,
    { headers: { Cookie: adminCookie } },
  );
  const secondAccountsPage = await secondAccountsPageResponse.json();
  assert.equal(secondAccountsPage.users.length, 1);
  assert.notEqual(
    secondAccountsPage.users[0].email,
    firstAccountsPage.users[0].email,
  );

  const invalidAccountsPageResponse = await fetch(
    `${baseUrl}/api/admin/users?page=1&limit=101`,
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(invalidAccountsPageResponse.status, 400);

  const historyResponse = await fetch(`${baseUrl}/api/admin/login-history`, {
    headers: { Cookie: adminCookie },
  });
  const historyBody = await historyResponse.json();
  assert.equal(historyResponse.status, 200);
  assert.equal(historyBody.history.length, 2);
  assert.equal(historyBody.history[0].user.email, "citizen@example.com");
  assert.equal(historyBody.history[1].user.email, "admin@example.com");
  assert.ok(historyBody.history[0].loginAt);
  assert.equal(historyBody.total, 2);
  assert.equal(historyBody.hasMore, false);

  const invalidPageResponse = await fetch(
    `${baseUrl}/api/admin/login-history?page=0&limit=50`,
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(invalidPageResponse.status, 400);
});

test("admins provision individual workers and assign reports", async () => {
  const invalidPasswordResponse = await fetch(`${baseUrl}/api/admin/workers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: "Rewa Field Worker",
      email: "worker@example.com",
      phone: "9876543210",
      password: "short",
    }),
  });
  assert.equal(invalidPasswordResponse.status, 400);

  const createResponse = await fetch(`${baseUrl}/api/admin/workers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: "Rewa Field Worker",
      email: "worker@example.com",
      phone: "9876543210",
      password: workerPassword,
    }),
  });
  const createdBody = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(createdBody.worker.role, "worker");
  assert.equal(createdBody.worker.mustChangePassword, false);
  assert.equal(createdBody.worker.passwordHash, undefined);
  assert.equal(createdBody.temporaryPassword, undefined);
  workerAccount = users.find((user) => user.email === "worker@example.com");

  const reportId = String(reports[0]._id);
  const assignmentResponse = await fetch(`${baseUrl}/api/reports/${reportId}/assignee`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workerId: workerAccount.id }),
  });
  assert.equal(assignmentResponse.status, 200);
  assert.equal(String(reports[0].assignedTo), workerAccount.id);
  assert.ok(reports[0].activity.some(
    (event) => event.event === "assignment" && String(event.assignedTo) === workerAccount.id,
  ));

  const workersResponse = await fetch(`${baseUrl}/api/admin/workers`, {
    headers: { Cookie: adminCookie },
  });
  const workersBody = await workersResponse.json();
  assert.equal(workersResponse.status, 200);
  assert.equal(workersBody.workers.length, 1);
  assert.equal(workersBody.workers[0].passwordHash, undefined);
});

test("admins can delete other accounts but cannot delete themselves", async () => {
  const invalidIdResponse = await fetch(`${baseUrl}/api/admin/users/not-an-id`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  assert.equal(invalidIdResponse.status, 400);

  const selfDeleteResponse = await fetch(
    `${baseUrl}/api/admin/users/${users.find((user) => user.role === "admin").id}`,
    {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    },
  );
  assert.equal(selfDeleteResponse.status, 400);

  const forbiddenResponse = await fetch(
    `${baseUrl}/api/admin/users/${users.find((user) => user.role === "admin").id}`,
    {
      method: "DELETE",
      headers: { Cookie: citizenCookie },
    },
  );
  assert.equal(forbiddenResponse.status, 403);

  const signupResponse = await postJson("/api/auth/register", {
    displayName: "Temporary Citizen",
    email: "temporary@example.com",
    password: "temporary-citizen-password",
  });
  assert.equal(signupResponse.status, 201);

  const loginResponse = await postJson("/api/auth/login", {
    email: "temporary@example.com",
    password: "temporary-citizen-password",
    role: "citizen",
  });
  assert.equal(loginResponse.status, 200);
  const deletedUser = users.find((user) => user.email === "temporary@example.com");
  assert.ok(loginEvents.some((event) => String(event.user) === deletedUser.id));
  const historyResponse = await fetch(`${baseUrl}/api/admin/login-history`, {
    headers: { Cookie: adminCookie },
  });
  const historyBody = await historyResponse.json();
  assert.ok(historyBody.history.some((entry) => entry.user?.email === deletedUser.email));

  const deleteResponse = await fetch(`${baseUrl}/api/admin/users/${deletedUser.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  const deleteBody = await deleteResponse.json();
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteBody.id, deletedUser.id);
  assert.equal(users.some((user) => user.id === deletedUser.id), false);
  assert.equal(loginEvents.some((event) => String(event.user) === deletedUser.id), false);

  const missingUserResponse = await fetch(
    `${baseUrl}/api/admin/users/${deletedUser.id}`,
    {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    },
  );
  assert.equal(missingUserResponse.status, 404);
});

test("workers log in with the admin-set password and can only work on assigned reports", async () => {
  const loginResponse = await postJson("/api/auth/login", {
    email: "worker@example.com",
    password: workerPassword,
    role: "worker",
  });
  const loginBody = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.equal(loginBody.user.mustChangePassword, false);
  assert.ok(loginEvents.some((event) => String(event.user) === String(workerAccount._id)));
  workerCookie = loginResponse.headers.get("set-cookie").split(";")[0];

  const previousFiles = new Set(await fs.readdir(uploadDirectory));
  const unauthorizedUpload = new FormData();
  unauthorizedUpload.set(
    "photo",
    new Blob(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: "image/png" },
    ),
    "worker.png",
  );
  const unauthorizedUploadResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { Cookie: workerCookie },
    body: unauthorizedUpload,
  });
  assert.equal(unauthorizedUploadResponse.status, 403);
  assert.deepEqual(new Set(await fs.readdir(uploadDirectory)), previousFiles);

  const photoReport = reports[1];
  const photoFilename = "123e4567-e89b-12d3-a456-426614174000.png";
  const photoPath = path.join(uploadDirectory, photoFilename);
  await fs.writeFile(
    photoPath,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  photoReport.imageUrl = `/uploads/${photoFilename}`;
  try {
    const photoAssignmentResponse = await fetch(
      `${baseUrl}/api/reports/${photoReport._id}/assignee`,
      {
        method: "PATCH",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: workerAccount.id }),
      },
    );
    assert.equal(photoAssignmentResponse.status, 200);

    const assignedPhotoResponse = await fetch(`${baseUrl}${photoReport.imageUrl}`, {
      headers: { Cookie: workerCookie },
    });
    assert.equal(assignedPhotoResponse.status, 200);

    const otherCitizenPhotoResponse = await fetch(`${baseUrl}${photoReport.imageUrl}`, {
      headers: { Cookie: citizenCookie },
    });
    assert.equal(otherCitizenPhotoResponse.status, 404);
  } finally {
    await fetch(`${baseUrl}/api/reports/${photoReport._id}/assignee`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workerId: null }),
    });
    await fs.unlink(photoPath);
  }

  const reportsResponse = await fetch(`${baseUrl}/api/reports`, {
    headers: { Cookie: workerCookie },
  });
  const reportsBody = await reportsResponse.json();
  assert.equal(reportsResponse.status, 200);
  assert.equal(reportsBody.count, 1);
  assert.equal(String(reportsBody.reports[0]._id), String(reports[0]._id));

  const unassignedReport = reports.find(
    (report) => String(report.assignedTo) !== workerAccount.id,
  );
  const forbiddenStatusResponse = await fetch(
    `${baseUrl}/api/reports/${unassignedReport._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: workerCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Resolved" }),
    },
  );
  assert.equal(forbiddenStatusResponse.status, 403);

  const assignedStatusResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: workerCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "In Progress" }),
    },
  );
  assert.equal(assignedStatusResponse.status, 200);

  const activityCount = reports[0].activity.length;
  const unchangedStatusResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: workerCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "In Progress" }),
    },
  );
  assert.equal(unchangedStatusResponse.status, 200);
  assert.equal(reports[0].activity.length, activityCount);

  const unauthorizedCreation = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      Cookie: workerCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Not a citizen report" }),
  });
  assert.equal(unauthorizedCreation.status, 403);

  const directResolutionResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/status`,
    {
      method: "PATCH",
      headers: {
        Cookie: workerCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Resolved" }),
    },
  );
  assert.equal(directResolutionResponse.status, 403);

  const validPng = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const missingCompletionPhoto = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/resolution-evidence`,
    {
      method: "POST",
      headers: { Cookie: workerCookie },
      body: new FormData(),
    },
  );
  assert.equal(missingCompletionPhoto.status, 400);

  const evidenceForm = new FormData();
  evidenceForm.set("afterPhoto", new Blob([validPng], { type: "image/png" }), "after.png");
  const evidenceResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/resolution-evidence`,
    {
      method: "POST",
      headers: { Cookie: workerCookie },
      body: evidenceForm,
    },
  );
  const evidenceBody = await evidenceResponse.json();
  assert.equal(evidenceResponse.status, 201);
  const evidence = evidenceBody.report.resolutionEvidence[0];
  assert.equal(evidence.reviewStatus, "pending");
  assert.equal(evidence.beforeImageUrl, null);
  assert.match(evidence.afterImageUrl, /^\/uploads\/[\da-f-]{36}\.png$/i);
  assert.equal(reports[0].status, "In Progress");

  const duplicateSubmission = new FormData();
  duplicateSubmission.set("afterPhoto", new Blob([validPng], { type: "image/png" }), "after.png");
  const duplicateEvidenceResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/resolution-evidence`,
    {
      method: "POST",
      headers: { Cookie: workerCookie },
      body: duplicateSubmission,
    },
  );
  assert.equal(duplicateEvidenceResponse.status, 409);

  const rejectWithoutNoteResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/resolution-evidence/${evidence._id}/review`,
    {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "reject" }),
    },
  );
  assert.equal(rejectWithoutNoteResponse.status, 400);

  const reporterPhotoResponse = await fetch(`${baseUrl}${evidence.afterImageUrl}`, {
    headers: { Cookie: citizenCookie },
  });
  assert.equal(reporterPhotoResponse.status, 200);

  const approvalResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/resolution-evidence/${evidence._id}/review`,
    {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "approve" }),
    },
  );
  assert.equal(approvalResponse.status, 200);
  assert.equal(reports[0].status, "Resolved");
  assert.equal(reports[0].resolutionEvidence[0].reviewStatus, "approved");

  const repeatedReviewResponse = await fetch(
    `${baseUrl}/api/reports/${reports[0]._id}/resolution-evidence/${evidence._id}/review`,
    {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "approve" }),
    },
  );
  assert.equal(repeatedReviewResponse.status, 409);
});

test("deleting a worker clears report assignments and revokes their session", async () => {
  const assignedReport = reports.find(
    (report) => String(report.assignedTo) === String(workerAccount._id),
  );
  assert.ok(assignedReport);

  const deleteResponse = await fetch(`${baseUrl}/api/admin/users/${workerAccount.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  assert.equal(deleteResponse.status, 200);
  assert.equal(assignedReport.assignedTo, null);
  assert.equal(users.some((user) => user.id === workerAccount.id), false);
  assert.equal(loginEvents.some((event) => String(event.user) === workerAccount.id), false);

  const expiredWorkerSessionResponse = await fetch(`${baseUrl}/api/reports`, {
    headers: { Cookie: workerCookie },
  });
  assert.equal(expiredWorkerSessionResponse.status, 401);
});

test("admin duplicate-cluster endpoint is protected and groups nearby report pins", async () => {
  const citizenResponse = await fetch(`${baseUrl}/api/admin/duplicate-clusters`, {
    headers: { Cookie: citizenCookie },
  });
  assert.equal(citizenResponse.status, 403);

  const now = new Date();
  const firstId = new mongoose.Types.ObjectId();
  const secondId = new mongoose.Types.ObjectId();
  const clusterReports = [
    {
      _id: firstId,
      title: "Pothole near school",
      type: "Pothole",
      location: "Civil Lines",
      latitude: 24.5362,
      longitude: 81.3037,
      severity: "High",
      status: "Pending",
      createdAt: now,
    },
    {
      _id: secondId,
      title: "Road damage by school",
      type: "Pothole",
      location: "Civil Lines",
      latitude: 24.5363,
      longitude: 81.3037,
      severity: "Medium",
      status: "In Progress",
      createdAt: new Date(now.getTime() - 60_000),
    },
  ];
  reports.push(...clusterReports);

  try {
    const adminResponse = await fetch(`${baseUrl}/api/admin/duplicate-clusters`, {
      headers: { Cookie: adminCookie },
    });
    const body = await adminResponse.json();
    assert.equal(adminResponse.status, 200);
    assert.equal(body.radiusMeters, 100);
    assert.ok(body.clusters.some((cluster) =>
      cluster.reports.some((report) => report.id === String(firstId)) &&
      cluster.reports.some((report) => report.id === String(secondId)),
    ));
    const matchedReport = body.clusters
      .flatMap((cluster) => cluster.reports)
      .find((report) => report.id === String(firstId));
    assert.equal(matchedReport.reporter, undefined);
  } finally {
    reports.splice(reports.length - clusterReports.length, clusterReports.length);
  }
});

test("admin SLA endpoint summarizes due and escalated unresolved reports", async () => {
  const citizenResponse = await fetch(`${baseUrl}/api/admin/sla`, {
    headers: { Cookie: citizenCookie },
  });
  assert.equal(citizenResponse.status, 403);

  const now = new Date();
  const slaReports = [
    {
      _id: new mongoose.Types.ObjectId(),
      title: "Overdue urgent pothole",
      type: "Pothole",
      location: "Civil Lines",
      severity: "High",
      status: "In Progress",
      createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
      assignedTo: null,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      title: "Resolved pothole",
      type: "Pothole",
      location: "University Road",
      severity: "High",
      status: "Resolved",
      createdAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
    },
  ];
  reports.push(...slaReports);

  try {
    const response = await fetch(`${baseUrl}/api/admin/sla`, {
      headers: { Cookie: adminCookie },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.counts.overdue, 1);
    assert.equal(body.counts.level1, 1);
    assert.equal(body.items[0].title, "Overdue urgent pothole");
    assert.ok(body.items[0].dueAt);
    assert.equal(body.items[0].escalationLevel, 1);
  } finally {
    reports.splice(reports.length - slaReports.length, slaReports.length);
  }
});

test("logout clears the authentication cookie", async () => {
  const response = await postJson("/api/auth/logout", {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/i);
});
