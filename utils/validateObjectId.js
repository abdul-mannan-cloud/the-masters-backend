const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isValidObjectId = (id) => typeof id === "string" && OBJECT_ID_REGEX.test(id);

export default isValidObjectId;
