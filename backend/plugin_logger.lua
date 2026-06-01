local m_logger = require("logger")

local logger = {}

function logger.log(msg)
    m_logger:info(tostring(msg))
end

function logger.warn(msg)
    m_logger:warn(tostring(msg))
end

function logger.error(msg)
    m_logger:error(tostring(msg))
end

function logger.info(msg)
    m_logger:info(tostring(msg))
end

return logger
