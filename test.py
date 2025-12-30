input_file = "data.txt"
output_file = "http.txt"

with open(input_file, "r", encoding="utf-8") as f:
    text = f.read()

# убираем все вхождения http://
text = text.replace("http://", "")

with open(output_file, "w", encoding="utf-8") as f:
    f.write(text)

print("Готово. Результат записан в", output_file)
