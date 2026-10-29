# CI/CD 说明（GitHub Actions）

## 工作流总览

| 工作流 | 触发 | 产物 |
|---|---|---|
| `CI` | push/PR 到 main | typecheck + 单测 + 构建（合并门槛） |
| `Android APK` | tag `android-v*` 或手动 | APK → Artifacts / Releases |
| `Windows EXE` | tag `win-v*` 或手动 | NSIS 安装包 → Artifacts / Releases |
| `Server Docker Images` | tag `server-v*` 或手动 | server / admin-web 镜像 → ghcr.io |

## Android APK 签名配置（正式发布前必做）

1. 本机生成签名密钥（一次即可，妥善备份）：

```bash
keytool -genkey -v -keystore cps-release.keystore -alias cps -keyalg RSA -keysize 2048 -validity 10950
```

2. 仓库 Settings → Secrets and variables → Actions → New repository secret，添加：

| Secret 名 | 值 |
|---|---|
| `ANDROID_KEYSTORE_B64` | `base64 -w0 cps-release.keystore` 的输出（Windows: `certutil -encode` 后去掉头尾行） |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | `cps` |
| `ANDROID_KEY_PASSWORD` | key 密码 |

3. 在 `apps/client-android/android/app/build.gradle` 的 `android { signingConfigs { } }` 中加入（Capacitor 生成工程后）：

```gradle
signingConfigs {
    release {
        if (System.getenv("ANDROID_KEYSTORE_PASSWORD") != null) {
            storeFile file("release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
}
buildTypes {
    release {
        if (System.getenv("ANDROID_KEYSTORE_PASSWORD") != null) {
            signingConfig signingConfigs.release
        }
    }
}
```

并在 workflow 的 gradle 步骤补传环境变量（`env:` 段引用上述 Secrets）。

> 未配置 Secrets 时，workflow 自动打 **debug 签名 APK**（可直接安装体验，不可上架/正式部署）。

## 发布节奏建议

- 每里程碑结束：`git tag android-v0.x.0 && git push --tags` → Actions 自动出包。
- 服务端发版：`git tag server-v0.x.0` → GHCR 出镜像，服务器 `docker compose pull && docker compose up -d` 升级。

## 首次启用清单

1. 推送仓库到 GitHub（私有）。
2. Settings → Branches → main 保护规则：要求 CI 通过方可合并。
3. 手动跑一次 `Android APK` / `Windows EXE` workflow 验证链路。
4. 正式发布前完成签名 Secrets 配置（上文）。
