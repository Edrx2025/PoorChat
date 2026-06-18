const {
  validateUsername,
  validatePassword,
  validateDisplayName,
} = require("../utils/validators");
const { hashPassword, verifyPassword } = require("../utils/password");
const { publicUser } = require("../utils/presenters");

class AuthService {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async register({ username, displayName, password }) {
    const cleanUsername = validateUsername(username);
    const cleanDisplayName = validateDisplayName(displayName);
    const cleanPassword = validatePassword(password);

    if (this.userRepository.findByUsername(cleanUsername)) {
      throw new Error("El username ya está registrado");
    }

    const passwordHash = await hashPassword(cleanPassword);
    const user = this.userRepository.create({
      username: cleanUsername,
      displayName: cleanDisplayName,
      passwordHash,
    });

    return publicUser(user);
  }

  async login({ username, password }) {
    const cleanUsername = validateUsername(username);
    const user = this.userRepository.findByUsername(cleanUsername);

    if (!user) {
      throw new Error("El usuario no existe");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword) {
      throw new Error("La contraseña es incorrecta");
    }

    const onlineUser = this.userRepository.updateStatus(user.id, "online");
    return publicUser(onlineUser);
  }

  logout(userId) {
    if (!userId) return;
    this.userRepository.updateStatus(userId, "offline");
  }
}

module.exports = AuthService;
