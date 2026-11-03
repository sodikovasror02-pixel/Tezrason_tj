-- Тезрасон: танҳо доставка. Такси нест карда мешавад; суроғаҳо, пардохт, минтақа, ETA илова мешаванд.

-- 1) Нест кардани такси
DELETE FROM orders WHERE kind = 'taxi';
DROP TABLE rides;
DROP TABLE tariffs;

ALTER TABLE orders DROP CONSTRAINT orders_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('food','market'));
ALTER TABLE orders DROP CONSTRAINT orders_check;            -- (kind = 'taxi' OR merchant_id IS NOT NULL)
ALTER TABLE orders ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE orders RENAME COLUMN driver_id TO courier_id;
ALTER INDEX orders_driver_idx RENAME TO orders_courier_idx;

UPDATE users SET role = 'courier' WHERE role = 'driver';
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer','courier','merchant','admin'));

-- 2) Минтақаи расонидан ва фармоиши ҳадди ақал
ALTER TABLE merchants ADD COLUMN delivery_radius_km NUMERIC(4,1) NOT NULL DEFAULT 7.0 CHECK (delivery_radius_km > 0);
ALTER TABLE merchants ADD COLUMN min_order INT NOT NULL DEFAULT 0 CHECK (min_order >= 0);   -- дирам
UPDATE merchants SET min_order = 2000 WHERE kind = 'restaurant';                          -- 20 с.

-- 3) Суроға: тафсилот барои курьер
ALTER TABLE orders ADD COLUMN entrance  TEXT;   -- даромадгоҳ (подъезд)
ALTER TABLE orders ADD COLUMN floor     TEXT;   -- ошёна
ALTER TABLE orders ADD COLUMN apartment TEXT;   -- хона/офис
ALTER TABLE orders ADD COLUMN comment   TEXT;
ALTER TABLE orders ADD COLUMN route_km  NUMERIC(6,2);
ALTER TABLE orders ADD COLUMN eta_at    TIMESTAMPTZ;  -- вақти тахминии расидан

CREATE TABLE user_addresses (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,                  -- «Хона», «Кор» …
  address     TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon         DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  entrance    TEXT,
  floor       TEXT,
  apartment   TEXT,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_addresses_user_idx ON user_addresses(user_id);

-- 4) Пардохт
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'none'
  CHECK (payment_status IN ('none','pending','paid','failed','refunded'));

CREATE TABLE payments (
  id            BIGSERIAL PRIMARY KEY,
  order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  provider_ref  TEXT NOT NULL UNIQUE,
  amount        INT NOT NULL CHECK (amount > 0),   -- дирам
  status        TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id);
