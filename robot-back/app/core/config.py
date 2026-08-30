from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "robot_welding"

    JWT_SECRET_KEY: str = "change_me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    ROBOT_CORE_URL: str = "http://localhost:8080"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )


settings = Settings()

# JWT_SECRET_KEY가 기본값(또는 너무 짧은 값)으로 남아있으면 누구나 admin 토큰을 위조할 수 있으므로
# .env가 누락/오설정된 상태로 조용히 기동되지 않도록 여기서 바로 막는다.
if "change" in settings.JWT_SECRET_KEY.lower() or len(settings.JWT_SECRET_KEY) < 16:
    raise RuntimeError(
        "JWT_SECRET_KEY가 설정되지 않았거나 너무 짧습니다 (.env의 JWT_SECRET_KEY를 "
        "16자 이상의 랜덤 값으로 설정하세요). 기본값으로는 서버를 시작할 수 없습니다."
    )
