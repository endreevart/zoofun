namespace VirtualZoo.Domain
{
    public readonly struct ValidationResult
    {
        public ValidationResult(bool isValid, string error)
        {
            IsValid = isValid;
            Error = error ?? string.Empty;
        }

        public bool IsValid { get; }
        public string Error { get; }

        public static ValidationResult Ok() => new ValidationResult(true, string.Empty);

        public static ValidationResult Fail(string error) => new ValidationResult(false, error);
    }
}
