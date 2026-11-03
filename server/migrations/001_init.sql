-- Хизмат: схемаи ибтидоӣ. Пул ҳамеша бо ДИРАМ (integer): 1 сомонӣ = 100 дирам.

CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+992[0-9]{9}$'),
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'customer'
              CHECK (role IN ('customer','driver','courier','merchant','admin')),
  merchant_id BIGINT,                         -- барои role = merchant
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  phone       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,                  -- sha256(code + phone)
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0
);

CREATE TABLE merchants (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('restaurant','market')),
  name        TEXT NOT NULL,
  cuisine_tj  TEXT,
  cuisine_ru  TEXT,
  emoji       TEXT,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon         DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  rating      NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  prep_min    INT NOT NULL DEFAULT 20,        -- вақти омодасозӣ, дақ
  is_open     BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE users ADD CONSTRAINT users_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id);

CREATE TABLE products (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name_tj     TEXT NOT NULL,
  name_ru     TEXT NOT NULL,
  unit_tj     TEXT,
  unit_ru     TEXT,
  category    TEXT,
  emoji       TEXT,
  price       INT NOT NULL CHECK (price > 0),  -- дирам
  available   BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX products_merchant_idx ON products(merchant_id);

CREATE TABLE tariffs (
  id          TEXT PRIMARY KEY,
  name_tj     TEXT NOT NULL,
  name_ru     TEXT NOT NULL,
  emoji       TEXT,
  base        INT NOT NULL,                   -- дирам
  per_km      INT NOT NULL,                   -- дирам/км
  per_min     INT NOT NULL,                   -- дирам/дақ
  min_fare    INT NOT NULL                    -- дирам
);

CREATE TABLE orders (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL CHECK (kind IN ('food','market','taxi')),
  status       TEXT NOT NULL,
  merchant_id  BIGINT REFERENCES merchants(id),
  driver_id    BIGINT REFERENCES users(id),    -- ронанда ё курьер
  address      TEXT,
  lat          DOUBLE PRECISION,
  lon          DOUBLE PRECISION,
  payment      TEXT NOT NULL CHECK (payment IN ('cash','card')),
  subtotal     INT NOT NULL DEFAULT 0,
  delivery_fee INT NOT NULL DEFAULT 0,
  service_fee  INT NOT NULL DEFAULT 0,
  total        INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind = 'taxi' OR merchant_id IS NOT NULL)
);
CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX orders_merchant_idx ON orders(merchant_id, created_at DESC);
CREATE INDEX orders_driver_idx ON orders(driver_id) WHERE driver_id IS NOT NULL;

CREATE TABLE order_items (
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  name_tj     TEXT NOT NULL,                  -- snapshot: нарх/ном дар лаҳзаи фармоиш
  name_ru     TEXT NOT NULL,
  price       INT NOT NULL,
  qty         INT NOT NULL CHECK (qty BETWEEN 1 AND 99),
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE rides (
  order_id    BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  tariff_id   TEXT NOT NULL REFERENCES tariffs(id),
  from_lat    DOUBLE PRECISION NOT NULL,
  from_lon    DOUBLE PRECISION NOT NULL,
  to_lat      DOUBLE PRECISION NOT NULL,
  to_lon      DOUBLE PRECISION NOT NULL,
  from_name   TEXT,
  to_name     TEXT,
  route_km    NUMERIC(8,3) NOT NULL,
  minutes     NUMERIC(8,2) NOT NULL,
  surge       NUMERIC(3,2) NOT NULL
);

-- Журнали тағйири ҳолатҳо (audit trail)
CREATE TABLE order_events (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  actor_id    BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events(order_id);
