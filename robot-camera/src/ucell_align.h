// [v1.1.310] Gemini 깊이 사진으로 U셀 위치 대략 보정 (robot_camera 전용, 표준 라이브러리만 사용)
// 기준 사진(티칭할 때 U셀 위치)과 지금 사진의 U셀 점들을 point-to-plane ICP 로 맞춰
// 카메라 기준 이동을 구하고, 카메라-로봇 관계(CALIB_R, CALIB_P)로 로봇 좌표 이동(Rr, tr)으로 바꾼다.
// 티칭 포인트 p 의 보정 위치 = Rr * p + tr.
// 보정값 출처: 2026-11-18 16:17~16:31 시험 6세트(기준 16:21) + U셀 면(뒷면·바닥) 방향.
//   2026-11-19 08:06~08:17 6세트 검증: 접촉점 오차 중앙 2.0mm, 상위10% 5.6mm, 최대 12.9mm(회전 오차).
// 카메라 브라켓 위치·각도가 바뀌면 이 값과 STATIC_MASK 를 다시 만들어야 한다.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

namespace ualign {

// 카메라 -> 로봇: p_robot = CALIB_R * p_cam + CALIB_P (mm)
static const double CALIB_R[9] = {0.122152, 0.005832, -0.992494,
                                  0.992501, 0.003775, 0.122175,
                                  0.004459, -0.999976, -0.005327};
static const double CALIB_P[3] = {-70.0, -70.0, 194.0};
// 로봇 이동량을 표시하는 기준점(U셀 뒷면 가운데 바닥 근처)
static const double REPORT_CENTER[3] = {-490.0, -70.0, 10.0};
// 움직이지 않는 배경(작업대·로봇·벽) 4x4 블록 마스크 1280x800 기준(320x200), 0/1 교대 길이
static const char *STATIC_MASK_RLE = "18705,1,320,1,640,1,1277,1,5,3,318,4,627,1,12,1,305,1,1,1,11,1,305,2,69,1,249,1,69,1,1534,1,639,1,318,2,319,3,318,1,318,2,1,1,316,4,317,2,1,1,313,1,3,3,313,1,3,2,314,1,315,1,1,1,1,1,3,2,311,1,2,1,1,2,312,2,2,1,316,5,5,1,309,4,315,5,315,6,313,6,314,1,1,2,318,1,320,2,318,2,314,1,2,2,1,1,313,1,2,2,1,1,314,1,1,4,314,2,1,3,315,5,314,7,313,1,1,3,315,4,1,1,314,4,1,1,313,6,315,6,1,1,312,3,1,2,1,1,64,1,249,2,3,2,63,1,245,1,319,5,314,5,315,6,314,1,1,3,315,1,1,1,1,1,315,1,1,1,318,4,317,2,631,2,78,1,1534,4,1,1,314,12,308,12,310,11,308,11,308,2,1,9,306,1,2,11,304,1,1,1,1,1,1,9,305,1,1,2,2,9,305,3,6,4,304,5,7,3,303,1,1,4,8,2,303,7,312,5,1,1,313,1,1,5,1,1,11540,1,14,2,2031,1,304,2,5,4,4,1,272,45,262,59,243,79,228,92,208,112,205,115,202,117,174,11,1,4,11,121,161,28,7,123,147,173,136,1,2,6,3,1,2,17,2,149,131,9,40,139,186,132,194,1,2,121,31";
static const int MASK_W = 320, MASK_H = 200;
// 3픽셀 간격(점 약 3만 개), 법선 이웃 5픽셀, ICP 50회 (2픽셀·80회와 결과 같고 5배 빠름)
static const double kPi = 3.14159265358979323846;
static const int CLOUD_STEP = 3, NORMAL_R = 5, ICP_ITERS = 50;

struct Depth {
    int w = 0, h = 0;
    std::vector<uint16_t> mm;
    uint16_t at(int u, int v) const { return mm[(size_t)v * w + u]; }
};
struct Intr { double fx = 0, fy = 0, cx = 0, cy = 0; };
struct V3 { double x, y, z; };
static V3 operator-(V3 a, V3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
static V3 cross(V3 a, V3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
static double dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

// 16비트 PGM(P5, big-endian, mm) 읽기
static bool loadPgm(const std::string &path, Depth &d) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::string magic; int maxv = 0;
    f >> magic >> d.w >> d.h >> maxv;
    if (magic != "P5" || d.w <= 0 || d.h <= 0 || maxv <= 255) return false;
    f.get();
    std::vector<uint8_t> raw((size_t)d.w * d.h * 2);
    if (!f.read((char *)raw.data(), (std::streamsize)raw.size())) return false;
    d.mm.resize((size_t)d.w * d.h);
    for (size_t i = 0; i < d.mm.size(); i++) d.mm[i] = (uint16_t)((raw[i * 2] << 8) | raw[i * 2 + 1]);
    return true;
}

static std::vector<uint8_t> staticMask() {
    std::vector<uint8_t> m((size_t)MASK_W * MASK_H, 0);
    std::stringstream ss(STATIC_MASK_RLE);
    std::string tok; size_t pos = 0; uint8_t val = 0;
    while (std::getline(ss, tok, ',')) {
        size_t n = (size_t)std::stoul(tok);
        for (size_t i = 0; i < n && pos < m.size(); i++) m[pos++] = val;
        val ^= 1;
    }
    return m;
}

// U셀 후보 점: 250~900mm, 배경 마스크 제외, step 픽셀 간격
static void buildCloud(const Depth &d, const Intr &k, int step, std::vector<V3> &pts, std::vector<int> *pix = nullptr) {
    static const std::vector<uint8_t> mask = staticMask();
    pts.clear();
    if (pix) pix->clear();
    for (int v = 0; v < d.h; v += step)
        for (int u = 0; u < d.w; u += step) {
            double z = d.at(u, v);
            if (z <= 250 || z >= 900) continue;
            int mu = u * MASK_W / d.w, mv = v * MASK_H / d.h;
            if (mask[(size_t)mv * MASK_W + mu]) continue;
            pts.push_back({(u - k.cx) * z / k.fx, (v - k.cy) * z / k.fy, z});
            if (pix) pix->push_back(v * d.w + u);
        }
}

// 기준 점의 법선: 깊이 격자 이웃(±r 픽셀) 외적
static bool gridNormal(const Depth &d, const Intr &k, int u, int v, V3 &n) {
    const int r = NORMAL_R;
    if (u < r || v < r || u >= d.w - r || v >= d.h - r) return false;
    auto P = [&](int uu, int vv, V3 &o) {
        double z = d.at(uu, vv);
        if (z <= 0) return false;
        o = {(uu - k.cx) * z / k.fx, (vv - k.cy) * z / k.fy, z};
        return true;
    };
    V3 c, a1, a2, b1, b2;
    if (!P(u, v, c) || !P(u + r, v, a1) || !P(u - r, v, a2) || !P(u, v + r, b1) || !P(u, v - r, b2)) return false;
    for (const V3 *q : {&a1, &a2, &b1, &b2}) if (std::fabs(q->z - c.z) > 20) return false;
    n = cross(a1 - a2, b1 - b2);
    double l = std::sqrt(dot(n, n));
    if (l < 1e-9) return false;
    n = {n.x / l, n.y / l, n.z / l};
    if (n.z > 0) n = {-n.x, -n.y, -n.z};
    return true;
}

// 최근접 점 검색용 k-d 트리
class KdTree {
public:
    explicit KdTree(const std::vector<V3> &p) : p_(p), idx_(p.size()) {
        std::iota(idx_.begin(), idx_.end(), 0);
        if (!p.empty()) build(0, (int)p.size(), 0);
    }
    int nearest(const V3 &q, double &d2) const {
        int best = -1; d2 = 1e30;
        if (!p_.empty()) search(0, (int)p_.size(), 0, q, best, d2);
        return best;
    }
private:
    static double c(const V3 &v, int a) { return a == 0 ? v.x : a == 1 ? v.y : v.z; }
    void build(int lo, int hi, int depth) {
        if (hi - lo <= 8) return;
        int a = depth % 3, mid = (lo + hi) / 2;
        std::nth_element(idx_.begin() + lo, idx_.begin() + mid, idx_.begin() + hi,
                         [&](int i, int j) { return c(p_[i], a) < c(p_[j], a); });
        build(lo, mid, depth + 1); build(mid + 1, hi, depth + 1);
    }
    void search(int lo, int hi, int depth, const V3 &q, int &best, double &d2) const {
        if (hi - lo <= 8) {
            for (int i = lo; i < hi; i++) {
                V3 dd = p_[idx_[i]] - q; double e = dot(dd, dd);
                if (e < d2) { d2 = e; best = idx_[i]; }
            }
            return;
        }
        int a = depth % 3, mid = (lo + hi) / 2;
        const V3 &m = p_[idx_[mid]];
        V3 dd = m - q; double e = dot(dd, dd);
        if (e < d2) { d2 = e; best = idx_[mid]; }
        double diff = c(q, a) - c(m, a);
        if (diff < 0) { search(lo, mid, depth + 1, q, best, d2); if (diff * diff < d2) search(mid + 1, hi, depth + 1, q, best, d2); }
        else { search(mid + 1, hi, depth + 1, q, best, d2); if (diff * diff < d2) search(lo, mid, depth + 1, q, best, d2); }
    }
    const std::vector<V3> &p_;
    std::vector<int> idx_;
};

struct Rt { double R[9] = {1, 0, 0, 0, 1, 0, 0, 0, 1}; double t[3] = {0, 0, 0}; };
static V3 apply(const Rt &m, const V3 &p) {
    return {m.R[0] * p.x + m.R[1] * p.y + m.R[2] * p.z + m.t[0], m.R[3] * p.x + m.R[4] * p.y + m.R[5] * p.z + m.t[1],
            m.R[6] * p.x + m.R[7] * p.y + m.R[8] * p.z + m.t[2]};
}
static Rt mul(const Rt &a, const Rt &b) {  // a 다음 b 가 아니라 a*b (b 먼저)
    Rt o;
    for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) {
        o.R[i * 3 + j] = 0;
        for (int k = 0; k < 3; k++) o.R[i * 3 + j] += a.R[i * 3 + k] * b.R[k * 3 + j];
    }
    for (int i = 0; i < 3; i++) o.t[i] = a.R[i * 3] * b.t[0] + a.R[i * 3 + 1] * b.t[1] + a.R[i * 3 + 2] * b.t[2] + a.t[i];
    return o;
}
static Rt inverse(const Rt &a) {
    Rt o;
    for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) o.R[i * 3 + j] = a.R[j * 3 + i];
    for (int i = 0; i < 3; i++) o.t[i] = -(o.R[i * 3] * a.t[0] + o.R[i * 3 + 1] * a.t[1] + o.R[i * 3 + 2] * a.t[2]);
    return o;
}
static Rt rodrigues(double ax, double ay, double az) {
    Rt o; double th = std::sqrt(ax * ax + ay * ay + az * az);
    if (th < 1e-12) return o;
    double kx = ax / th, ky = ay / th, kz = az / th, c = std::cos(th), s = std::sin(th), v = 1 - c;
    double R[9] = {c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s,
                   ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s,
                   kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v};
    std::copy(R, R + 9, o.R);
    return o;
}
static bool solve6(double A[6][6], double b[6], double x[6]) {
    for (int c = 0; c < 6; c++) {
        int p = c;
        for (int r = c + 1; r < 6; r++) if (std::fabs(A[r][c]) > std::fabs(A[p][c])) p = r;
        if (std::fabs(A[p][c]) < 1e-12) return false;
        if (p != c) { for (int k = 0; k < 6; k++) std::swap(A[c][k], A[p][k]); std::swap(b[c], b[p]); }
        for (int r = c + 1; r < 6; r++) {
            double f = A[r][c] / A[c][c];
            for (int k = c; k < 6; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
        }
    }
    for (int r = 5; r >= 0; r--) {
        double s = b[r];
        for (int k = r + 1; k < 6; k++) s -= A[r][k] * x[k];
        x[r] = s / A[r][r];
    }
    return true;
}

struct Result {
    bool ok = false;
    std::string error;
    Rt robot;            // 기준 -> 지금, 로봇 좌표
    double center[3] = {0, 0, 0};  // REPORT_CENTER 이동량
    double yawDeg = 0, rotDeg = 0, rms = 0, inlier = 0;
    int srcPts = 0, dstPts = 0;
};

// ref: 기준 깊이, cur: 지금 깊이. 각자 촬영 당시 내부 파라미터.
static Result estimate(const Depth &ref, const Intr &kr, const Depth &cur, const Intr &kc) {
    Result res;
    std::vector<V3> dstAll, src; std::vector<int> pix;
    buildCloud(ref, kr, CLOUD_STEP, dstAll, &pix);
    std::vector<V3> dst, nrm;
    for (size_t i = 0; i < dstAll.size(); i++) {
        V3 n;
        if (gridNormal(ref, kr, pix[i] % ref.w, pix[i] / ref.w, n)) { dst.push_back(dstAll[i]); nrm.push_back(n); }
    }
    buildCloud(cur, kc, CLOUD_STEP, src);
    res.srcPts = (int)src.size(); res.dstPts = (int)dst.size();
    if (dst.size() < 2000 || src.size() < 2000) { res.error = "U셀 깊이 점이 너무 적습니다"; return res; }
    KdTree tree(dst);
    Rt T;  // src(지금) -> dst(기준)
    double thr = 20;
    for (int it = 0; it < ICP_ITERS; it++) {
        double A[6][6] = {}, b[6] = {};
        int used = 0;
        for (const V3 &p0 : src) {
            V3 p = apply(T, p0); double d2;
            int j = tree.nearest(p, d2);
            if (j < 0 || d2 > thr * thr) continue;
            const V3 &n = nrm[j];
            V3 cpn = cross(p, n);
            double row[6] = {cpn.x, cpn.y, cpn.z, n.x, n.y, n.z}, r = dot(dst[j] - p, n);
            for (int a = 0; a < 6; a++) { b[a] += row[a] * r; for (int c = 0; c < 6; c++) A[a][c] += row[a] * row[c]; }
            used++;
        }
        double x[6];
        if (used < 1000 || !solve6(A, b, x)) { res.error = "맞출 점이 부족합니다"; return res; }
        Rt step = rodrigues(x[0], x[1], x[2]);
        step.t[0] = x[3]; step.t[1] = x[4]; step.t[2] = x[5];
        T = mul(step, T);
        thr = std::max(5.0, thr * 0.92);
    }
    double se = 0; int in = 0;
    for (const V3 &p0 : src) {
        double d2; tree.nearest(apply(T, p0), d2);
        if (d2 < 25) { se += d2; in++; }
    }
    res.inlier = (double)in / src.size();
    res.rms = in ? std::sqrt(se / in) : 99;
    // 카메라: 기준 -> 지금 = T^-1. 로봇: C * Tc * C^-1
    Rt C; std::copy(CALIB_R, CALIB_R + 9, C.R); std::copy(CALIB_P, CALIB_P + 3, C.t);
    res.robot = mul(C, mul(inverse(T), inverse(C)));
    V3 c0{REPORT_CENTER[0], REPORT_CENTER[1], REPORT_CENTER[2]}, c1 = apply(res.robot, c0);
    res.center[0] = c1.x - c0.x; res.center[1] = c1.y - c0.y; res.center[2] = c1.z - c0.z;
    const double *R = res.robot.R;
    res.yawDeg = std::atan2(R[3], R[0]) * 180.0 / kPi;
    res.rotDeg = std::acos(std::max(-1.0, std::min(1.0, (R[0] + R[4] + R[8] - 1) / 2))) * 180.0 / kPi;
    res.ok = true;
    return res;
}

}  // namespace ualign
