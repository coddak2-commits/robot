// jwt_verify.h - robot-back(FastAPI)가 발급한 JWT(HS256)를 robot-core에서 검증
// 헤더 전용(header-only), 외부 라이브러리 의존성 없음(SHA-256/HMAC 자체 구현)
//
// robot-back(app/core/security.py)과 반드시 동일한 대칭키(secret)를 사용해야 한다.
// robot-back: .env의 JWT_SECRET_KEY
// robot-core: config.ini의 [auth] jwt_secret
//
// 사용 예:
//   auto payload = jwtauth::verifyToken(token, ConfigService::instance().getJwtSecret());
//   if (payload.is_null()) { /* 401 처리 */ }
//   std::string role = payload.value("role", "");

#ifndef JWT_VERIFY_H_
#define JWT_VERIFY_H_

#include <array>
#include <cstdint>
#include <cstring>
#include <ctime>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace jwtauth {
namespace detail {

using u32 = uint32_t;

inline u32 rotr(u32 x, u32 n) { return (x >> n) | (x << (32 - n)); }

// SHA-256 (FIPS 180-4). 결과는 32바이트 다이제스트.
inline std::array<unsigned char, 32> sha256(const unsigned char* data, size_t len) {
    static const u32 K[64] = {
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    };
    u32 h[8] = {
        0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
        0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
    };

    std::vector<unsigned char> msg(data, data + len);
    const uint64_t bitLen = static_cast<uint64_t>(len) * 8;
    msg.push_back(0x80);
    while (msg.size() % 64 != 56) msg.push_back(0);
    for (int i = 7; i >= 0; --i) {
        msg.push_back(static_cast<unsigned char>((bitLen >> (i * 8)) & 0xff));
    }

    for (size_t chunk = 0; chunk < msg.size(); chunk += 64) {
        u32 w[64];
        for (int i = 0; i < 16; ++i) {
            size_t p = chunk + static_cast<size_t>(i) * 4;
            w[i] = (u32(msg[p]) << 24) | (u32(msg[p + 1]) << 16) |
                   (u32(msg[p + 2]) << 8) | u32(msg[p + 3]);
        }
        for (int i = 16; i < 64; ++i) {
            u32 s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            u32 s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        u32 a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; ++i) {
            u32 S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            u32 ch = (e & f) ^ (~e & g);
            u32 temp1 = hh + S1 + ch + K[i] + w[i];
            u32 S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            u32 maj = (a & b) ^ (a & c) ^ (b & c);
            u32 temp2 = S0 + maj;
            hh = g; g = f; f = e; e = d + temp1;
            d = c; c = b; b = a; a = temp1 + temp2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }

    std::array<unsigned char, 32> out;
    for (int i = 0; i < 8; ++i) {
        out[i * 4]     = static_cast<unsigned char>((h[i] >> 24) & 0xff);
        out[i * 4 + 1] = static_cast<unsigned char>((h[i] >> 16) & 0xff);
        out[i * 4 + 2] = static_cast<unsigned char>((h[i] >> 8) & 0xff);
        out[i * 4 + 3] = static_cast<unsigned char>(h[i] & 0xff);
    }
    return out;
}

// HMAC-SHA256 (RFC 2104)
inline std::array<unsigned char, 32> hmacSha256(const std::string& key, const std::string& msg) {
    constexpr size_t blockSize = 64;
    std::vector<unsigned char> k(key.begin(), key.end());
    if (k.size() > blockSize) {
        auto kh = sha256(k.data(), k.size());
        k.assign(kh.begin(), kh.end());
    }
    k.resize(blockSize, 0);

    std::vector<unsigned char> inner(blockSize);
    std::vector<unsigned char> outer(blockSize);
    for (size_t i = 0; i < blockSize; ++i) {
        inner[i] = static_cast<unsigned char>(k[i] ^ 0x36);
        outer[i] = static_cast<unsigned char>(k[i] ^ 0x5c);
    }
    inner.insert(inner.end(), msg.begin(), msg.end());
    auto innerHash = sha256(inner.data(), inner.size());
    outer.insert(outer.end(), innerHash.begin(), innerHash.end());
    return sha256(outer.data(), outer.size());
}

// Base64URL(RFC 4648, 패딩 없음) 디코드. JWT의 header/payload/signature 파트에 사용.
inline std::string base64UrlDecode(const std::string& input) {
    static const std::string alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    static std::array<int, 256> table = [] {
        std::array<int, 256> t{};
        t.fill(-1);
        for (size_t i = 0; i < alphabet.size(); ++i) {
            t[static_cast<unsigned char>(alphabet[i])] = static_cast<int>(i);
        }
        return t;
    }();

    std::string out;
    int val = 0, bits = -8;
    for (unsigned char c : input) {
        if (table[c] == -1) continue; // '=' 패딩이나 개행 등은 무시
        val = (val << 6) + table[c];
        bits += 6;
        if (bits >= 0) {
            out.push_back(static_cast<char>((val >> bits) & 0xFF));
            bits -= 8;
        }
    }
    return out;
}

} // namespace detail

// JWT(HS256) 검증. 유효하면 payload(JSON)를 반환, 무효/만료/서명불일치면 null을 반환.
// alg가 HS256이 아닌 토큰(예: "none")은 항상 거부한다.
inline nlohmann::json verifyToken(const std::string& token, const std::string& secret) {
    if (secret.empty() || token.empty()) return nullptr;

    size_t dot1 = token.find('.');
    if (dot1 == std::string::npos) return nullptr;
    size_t dot2 = token.find('.', dot1 + 1);
    if (dot2 == std::string::npos) return nullptr;

    std::string headerPart = token.substr(0, dot1);
    std::string payloadPart = token.substr(dot1 + 1, dot2 - dot1 - 1);
    std::string sigPart = token.substr(dot2 + 1);

    nlohmann::json header;
    try {
        header = nlohmann::json::parse(detail::base64UrlDecode(headerPart));
    } catch (...) {
        return nullptr;
    }
    if (header.value("alg", "") != "HS256") {
        return nullptr;
    }

    const std::string signingInput = headerPart + "." + payloadPart;
    auto expectedSig = detail::hmacSha256(secret, signingInput);
    std::string providedSig = detail::base64UrlDecode(sigPart);
    if (providedSig.size() != expectedSig.size()) {
        return nullptr;
    }
    unsigned char diff = 0;
    for (size_t i = 0; i < expectedSig.size(); ++i) {
        diff |= static_cast<unsigned char>(providedSig[i]) ^ expectedSig[i];
    }
    if (diff != 0) {
        return nullptr;
    }

    nlohmann::json payload;
    try {
        payload = nlohmann::json::parse(detail::base64UrlDecode(payloadPart));
    } catch (...) {
        return nullptr;
    }
    if (payload.contains("exp")) {
        try {
            long long exp = payload["exp"].get<long long>();
            long long now = static_cast<long long>(std::time(nullptr));
            if (now >= exp) return nullptr;
        } catch (...) {
            return nullptr;
        }
    }
    return payload;
}

} // namespace jwtauth

#endif // JWT_VERIFY_H_
