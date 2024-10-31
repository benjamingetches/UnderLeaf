import tkinter as tk
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import tensorflow as tf
from process_to_lines import preprocess_char
import csv
import io
import cv2

class DrawingApp:
    def __init__(self, model_path, symbols_csv_path):
        self.root = tk.Tk()
        self.root.title("Draw Symbol for CNN Testing")
        
        # Load the model and symbols mapping
        self.model = tf.keras.models.load_model(model_path, compile=False)
        print("Model input shape:", self.model.input_shape)
        print("Model summary:")
        self.model.summary()
        self.symbols_map = self.load_symbols_mapping(symbols_csv_path)
        
        # Canvas setup
        self.canvas_width = 280
        self.canvas_height = 280
        self.canvas = tk.Canvas(self.root, 
                              width=self.canvas_width,
                              height=self.canvas_height,
                              bg='white')
        self.canvas.pack(pady=20)
        
        # Drawing variables
        self.drawing = False
        self.last_x = None
        self.last_y = None
        
        # Buttons
        button_frame = tk.Frame(self.root)
        button_frame.pack(pady=20)
        
        clear_btn = tk.Button(button_frame, text="Clear", command=self.clear_canvas)
        clear_btn.pack(side=tk.LEFT, padx=10)
        
        predict_btn = tk.Button(button_frame, text="Predict", command=self.predict_symbol)
        predict_btn.pack(side=tk.LEFT, padx=10)
        
        # Results label
        self.result_label = tk.Label(self.root, text="Draw a symbol and click Predict",
                                   font=("Arial", 14))
        self.result_label.pack(pady=20)
        
        # Bind mouse events
        self.canvas.bind("<Button-1>", self.start_drawing)
        self.canvas.bind("<B1-Motion>", self.draw)
        self.canvas.bind("<ButtonRelease-1>", self.stop_drawing)
        
    def load_symbols_mapping(self, csv_path):
        symbols = {}
        with open(csv_path, 'r') as file:
            reader = csv.DictReader(file)
            for row in reader:
                symbols[int(row['symbol_id'])] = row['latex']
        return symbols
    
    def start_drawing(self, event):
        self.drawing = True
        self.last_x = event.x
        self.last_y = event.y
    
    def draw(self, event):
        if self.drawing:
            self.canvas.create_line(self.last_x, self.last_y,
                                  event.x, event.y,
                                  width=15, fill='black',
                                  capstyle=tk.ROUND, smooth=True)
            self.last_x = event.x
            self.last_y = event.y
    
    def stop_drawing(self, event):
        self.drawing = False
    
    def clear_canvas(self):
        self.canvas.delete("all")
        self.result_label.config(text="Draw a symbol and click Predict")
    
    def predict_symbol(self):
        ps = self.canvas.postscript(colormode='gray')
        img = Image.open(io.BytesIO(ps.encode('utf-8')))
        img = img.convert('L')  # Convert to grayscale
        
        # Resize to 32x32 instead of 28x28
        img = img.resize((32, 32), Image.Resampling.LANCZOS)
        
        # Convert to numpy array and print shape
        img_array = np.array(img)
        print("Initial array shape:", img_array.shape)
        
        # Process the image to lines
        processed_image = preprocess_char(img_array)
        print("After preprocessing shape:", processed_image.shape)
        
        # Remove the resize to 28x28 and keep 32x32
        processed_image = processed_image.reshape(1, 32, 32, 1)
        print("Final shape:", processed_image.shape)
        
        # Normalize the image
        processed_image = processed_image / 255.0
        
        # Predict the symbol
        prediction = self.model.predict(processed_image)
        
        # Get the predicted symbol index
        predicted_index = np.argmax(prediction)
        
        # Get the predicted symbol latex
        predicted_symbol = self.symbols_map[predicted_index]
        
        # Update the result label
        self.result_label.config(text=f"Predicted Symbol: {predicted_symbol}")
        
        # Clear the canvas
        self.clear_canvas()
        
        # Draw the predicted symbol
        self.draw_predicted_symbol(predicted_symbol)
    
    def draw_predicted_symbol(self, symbol):
        # Create a larger image with white background
        img = Image.new('RGB', (self.canvas_width, self.canvas_height), 'white')
        draw = ImageDraw.Draw(img)
        
        # Try to load a larger font
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 60)
        except:
            font = ImageFont.load_default()
        
        # Calculate text size and center position
        text_bbox = draw.textbbox((0, 0), symbol, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        x = (self.canvas_width - text_width) // 2
        y = (self.canvas_height - text_height) // 2
        
        # Draw the text
        draw.text((x, y), symbol, fill='black', font=font)
        
        # Convert to PhotoImage directly
        self.photo = tk.PhotoImage(width=self.canvas_width, height=self.canvas_height)
        self.photo.put(' '.join(['#%02x%02x%02x' % pixel for pixel in img.getdata()]))
        
        # Draw the image on the canvas
        self.canvas.create_image(self.canvas_width // 2, self.canvas_height // 2,
                                image=self.photo,
                                anchor=tk.CENTER)
        
        # Update the result label
        self.result_label.config(text=f"Predicted Symbol: {symbol}")
    
    def test_training_image(self):
        # Load and preprocess the training image
        train_img = Image.open('v2-23107.png').convert('L')
        img_array = np.array(train_img)
        
        # Print shapes for debugging
        print("Training image original shape:", img_array.shape)
        processed_img = self.preprocess_image(img_array)
        print("Training image processed shape:", processed_img.shape)
        
        # Make prediction
        prediction = self.model.predict(processed_img)
        predicted_class = np.argmax(prediction[0])
        predicted_symbol = self.class_mapping[predicted_class]
        print("Training image prediction:", predicted_symbol)
        print("Prediction confidence:", prediction[0][predicted_class])
        
        # Optional: Show top 5 predictions
        top_5_indices = np.argsort(prediction[0])[-5:][::-1]
        print("\nTop 5 predictions:")
        for idx in top_5_indices:
            print(f"{self.class_mapping[idx]}: {prediction[0][idx]:.4f}")

app = DrawingApp('./model/cnn_hasy_model.h5', './symbols.csv')
app.root.mainloop() 